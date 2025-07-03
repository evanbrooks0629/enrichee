import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from "@/lib/auth"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { profile, researchPrompt, spreadsheetId, sheetName, rowIndex, columnIndex } = await request.json()

  try {
    // Skip if profile already has research
    if (profile.research && profile.research.trim() !== '') {
      return NextResponse.json({ 
        success: true, 
        skipped: true,
        profileId: profile.id,
        name: profile.name 
      })
    }

    // Replace variables in the research prompt
    const replaceVariables = (prompt: string, profile: Record<string, string | undefined>) => {
      return prompt.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
        const key = variable.trim()
        return profile[key] || match // Keep the variable if not found in profile
      })
    }

    // Use custom research prompt or fallback to default
    const defaultPrompt = `Conduct deep research on {{name}} from {{company}}. 
    
    Create a comprehensive professional research report on {{name}} and {{company}}.
    
    PART 1: INDIVIDUAL ANALYSIS
    
    Provide detailed information about {{name}} who works as {{role}} at {{company}}:
    
    1. Professional Background:
       - Current responsibilities at their company
       - Career trajectory and previous positions/companies
       - Years of experience in this role and industry
       - Key professional achievements and notable projects
       - Areas of specialization or expertise
    
    2. Educational Background:
       - Degrees, certifications, and institutions attended
       - Specialized training relevant to their current role
    
    3. Industry Presence:
       - Speaking engagements at conferences or industry events
       - Published articles, whitepapers, or research papers
       - Professional association memberships
       - LinkedIn profile details and activity
       - Other social media or professional online presence
    
    4. Professional Pain Points:
       - Common challenges faced by professionals in their role
       - Industry-specific issues that might affect their daily operations
       - Regulatory or compliance concerns relevant to their position
    
    PART 2: COMPANY ANALYSIS
    
    Comprehensive information about their company:
    
    1. Company Overview:
       - Industry classification and primary business focus
       - Company size (employees, revenue if public)
       - Year founded and brief history
       - Market positioning and key competitors
       - Parent company or subsidiaries, if applicable
    
    2. Recent Developments:
       - Recent news or press releases (last 1-2 years)
       - Recent product launches or service expansions
       - Mergers, acquisitions, or partnerships
       - Leadership changes or restructuring
       - Financial performance indicators (if public)
    
    3. Corporate Technology Stack:
       - Known technology systems or platforms used
       - Recent technology investments or digital transformation initiatives
       - Potential technology gaps or upgrade needs
    
    4. Business Challenges:
       - Industry-specific challenges the company might be facing
       - Market pressures or competitive threats
       - Regulatory changes affecting their business model
       - Growth opportunities they might be pursuing
    
    5. Company Culture:
       - Mission and values statements
       - Corporate social responsibility initiatives
       - Work environment and company reviews
    
    PART 3: REGIONAL CONTEXT
    
    Information about the business environment in their location:
    
    1. Local Business Climate:
       - Major industry trends in their location
       - Local economic conditions
       - Regional competitors or partners
    
    2. Regional Challenges:
       - Location-specific business challenges
       - Regulatory environment unique to this region
    
    PART 4: CONNECTION POINTS
    
    1. Potential Needs:
       - Based on role, company, and industry, what services or products might be most valuable
       - Specific pain points our solution could address
       
    2. Conversation Starters:
       - Recent company news that could be referenced
       - Industry trends relevant to both their business and our offering
       - Common connections or networking opportunities
    
    Provide factual, well-researched information only. Clearly distinguish between verified facts and potential inferences. Include sources where available.`

    const finalPrompt = replaceVariables(researchPrompt || defaultPrompt, profile)

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant that helps with business outreach by finding relevant, recent information about people and companies.'
          },
          {
            role: 'user',
            content: finalPrompt
          }
        ],
        max_tokens: 500,
        temperature: 0.2,
      }),
    })

    if (!perplexityResponse.ok) {
      throw new Error('Perplexity API request failed')
    }

    const perplexityData = await perplexityResponse.json()
    const research = perplexityData.choices[0]?.message?.content || 'No research data available'

    // Update the specific cell in Google Sheets
    const cellRange = `${sheetName}!${String.fromCharCode(65 + columnIndex)}${rowIndex + 2}` // +2 because row 1 is headers, and we're 0-indexed
    
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [[research]]
        }),
      }
    )

    if (!updateResponse.ok) {
      throw new Error('Failed to update Google Sheet')
    }

    return NextResponse.json({
      success: true,
      profileId: profile.id,
      name: profile.name,
      research
    })

  } catch (error) {
    console.error('Profile research error:', error)
    return NextResponse.json({
      success: false,
      profileId: profile?.id,
      name: profile?.name,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 