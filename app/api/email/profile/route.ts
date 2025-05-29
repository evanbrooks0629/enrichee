import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getGoogleServices } from '@/lib/google-services'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { profile, systemPrompt, emailSignature, spreadsheetId, sheetName, rowIndex, columnIndex } = await request.json()

    // Check if profile has research data
    if (!profile.research || profile.research.trim() === '') {
      return NextResponse.json({ 
        success: false, 
        error: 'Profile must have research data before generating email draft' 
      }, { status: 400 })
    }

    // Create the complete system prompt with signature
    const completeSystemPrompt = `${systemPrompt}\n\nLastly, make sure the signature is the following:\n\n${emailSignature}`

    // Create user prompt with profile data
    const userPrompt = `Generate a personalized email for this profile:\n\n${JSON.stringify(profile, null, 2)}`

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: completeSystemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const emailDraft = completion.choices[0].message.content

    if (!emailDraft) {
      throw new Error('No email draft generated')
    }

    // Clean up problematic Unicode characters immediately after OpenAI response
    const cleanedEmailDraft = emailDraft
      .replace(/'/g, "'")       // Replace smart apostrophe with regular apostrophe
      .replace(/'/g, "'")       // Replace another variant of smart apostrophe
      .replace(/"/g, '"')       // Replace smart quote left
      .replace(/"/g, '"')       // Replace smart quote right
      .replace(/–/g, '-')       // Replace en dash with hyphen
      .replace(/—/g, '-')       // Replace em dash with hyphen
      .replace(/…/g, '...')     // Replace ellipsis with three dots
      .replace(/"/g, '"')       // Replace another quote variant
      .replace(/'/g, "'")       // Replace another apostrophe variant
      .replace(/'/g, "'")       // Replace another apostrophe variant
      .replace("â€™", "'")

    // Update the Google Sheet using direct API call like research route
    try {
      // Add 'draft_id' column if it doesn't exist
      const addDraftIdColumnResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/google/sheets/${spreadsheetId}/${encodeURIComponent(sheetName)}/add-column`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          columnName: 'draft_id'
        }),
      })

      let draftIdColumnIndex = null // Initialize as null instead of fallback
      if (addDraftIdColumnResponse.ok) {
        const draftIdColumnData = await addDraftIdColumnResponse.json()
        draftIdColumnIndex = draftIdColumnData.columnIndex
      }

      // Convert to A1 notation for the cell update
      const columnLetter = String.fromCharCode(65 + columnIndex) // This should be the 'drafts' column
      const cellRow = rowIndex + 2 // +1 for header row, +1 for 1-indexed
      const cellRange = `${sheetName}!${columnLetter}${cellRow}`

      // Update the drafts column with the email content
      const updateResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            values: [[cleanedEmailDraft]]
          }),
        }
      )

      if (!updateResponse.ok) {
        throw new Error('Failed to update Google Sheet')
      }

      console.log(`Successfully updated sheet cell ${cellRange} with email draft`)

      // Create Gmail draft
      try {
        const { gmail } = await getGoogleServices()
        const recipientEmail = profile.email || profile.Email || profile.email_address || profile.contact_email
        if (recipientEmail) {
          const draftId = await gmail.createDraft(profile, cleanedEmailDraft, "")
          
          // Update the draft_id column only if we successfully created the draft_id column
          if (draftIdColumnIndex !== null) {
            const draftIdColumnLetter = String.fromCharCode(65 + draftIdColumnIndex)
            const draftIdCellRange = `${sheetName}!${draftIdColumnLetter}${cellRow}`
            
            const updateDraftIdResponse = await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(draftIdCellRange)}?valueInputOption=USER_ENTERED`,
              {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${session.accessToken}`,
                  'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                  values: [[draftId]]
                }),
              }
            )

            if (!updateDraftIdResponse.ok) {
              console.error('Failed to update Gmail draft ID in sheet')
            }
          }
          
          return NextResponse.json({
            success: true,
            profileId: profile.id,
            name: profile.name,
            emailDraft: cleanedEmailDraft,
            gmailDraftId: draftId
          })
        } else {
          return NextResponse.json({
            success: true,
            profileId: profile.id,
            name: profile.name,
            emailDraft: cleanedEmailDraft,
            gmailDraftId: null,
            gmailError: 'No email address found for Gmail draft'
          })
        }
      } catch (gmailError) {
        console.error('Gmail draft creation failed:', gmailError)
        return NextResponse.json({
          success: true,
          profileId: profile.id,
          name: profile.name,
          emailDraft: cleanedEmailDraft,
          gmailDraftId: null,
          gmailError: 'Failed to create Gmail draft'
        })
      }

    } catch (sheetError) {
      console.error('Failed to update sheet:', sheetError)
      return NextResponse.json({
        success: false,
        error: 'Failed to update Google Sheet with email draft'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Email generation error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate email draft' 
    }, { status: 500 })
  }
} 