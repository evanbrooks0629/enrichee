import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getGoogleServices } from '@/lib/google-services'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { gmailDraftId, updatedContent, recipientEmail, profileId, spreadsheetId, sheetName, rowIndex } = await request.json()

    if (!gmailDraftId) {
      return NextResponse.json({ 
        success: false, 
        error: 'No Gmail draft ID provided' 
      }, { status: 400 })
    }
    
    let errorMessage = ''

    try {
      const { gmail } = await getGoogleServices()

      // Update the draft with new content, then send it
      const result = await gmail.updateAndSendDraft(gmailDraftId, updatedContent, recipientEmail)

      // Add 'sent' column if it doesn't exist
      try {
        const addColumnResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/google/sheets/${spreadsheetId}/${encodeURIComponent(sheetName)}/add-column`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            columnName: 'sent'
          }),
        })

        if (addColumnResponse.ok) {
          const columnData = await addColumnResponse.json()
          const sentColumnIndex = columnData.columnIndex

          // Update the sent status in the sheet
          const columnLetter = String.fromCharCode(65 + sentColumnIndex)
          const cellRow = rowIndex + 2 // +1 for header row, +1 for 1-indexed
          const cellRange = `${sheetName}!${columnLetter}${cellRow}`

          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Content-Type': 'application/json; charset=utf-8',
              },
              body: JSON.stringify({
                values: [['TRUE']]
              }),
            }
          )
        }
      } catch (columnError) {
        console.error('Failed to update sent status in sheet:', columnError)
      }

      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        profileId,
        sent: true
      })

    } catch (emailError) {
      console.error('Error sending email:', emailError)
      errorMessage = emailError instanceof Error ? emailError.message : 'Failed to send email'

      // Still try to update the sheet with FALSE status
      try {
        const addColumnResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/google/sheets/${spreadsheetId}/${encodeURIComponent(sheetName)}/add-column`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            columnName: 'sent'
          }),
        })

        if (addColumnResponse.ok) {
          const columnData = await addColumnResponse.json()
          const sentColumnIndex = columnData.columnIndex

          const columnLetter = String.fromCharCode(65 + sentColumnIndex)
          const cellRow = rowIndex + 2
          const cellRange = `${sheetName}!${columnLetter}${cellRow}`

          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Content-Type': 'application/json; charset=utf-8',
              },
              body: JSON.stringify({
                values: [['FALSE']]
              }),
            }
          )
        }
      } catch (columnError) {
        console.error('Failed to update sent status in sheet:', columnError)
      }

      return NextResponse.json({ 
        success: false, 
        error: errorMessage,
        profileId,
        sent: false
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Error in send-draft endpoint:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to send email' 
    }, { status: 500 })
  }
} 