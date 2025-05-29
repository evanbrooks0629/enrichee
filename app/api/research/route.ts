import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

// Cost estimation constants
const PERPLEXITY_COST_PER_TOKEN = 0.000001 // $1 per million tokens
const PERPLEXITY_REQUEST_COST = 0.005 // $5 per 1000 requests
const ESTIMATED_TOKENS_PER_RESEARCH = 1500 // Average tokens for research

// Rate limiting
const requestTimes = new Map<string, number[]>()
const RATE_LIMIT_RPM = 60 // Requests per minute for Perplexity

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const userRequests = requestTimes.get(userId) || []
  
  // Remove requests older than 1 minute
  const recentRequests = userRequests.filter(time => now - time < 60000)
  requestTimes.set(userId, recentRequests)
  
  return recentRequests.length < RATE_LIMIT_RPM
}

function recordRequest(userId: string) {
  const userRequests = requestTimes.get(userId) || []
  userRequests.push(Date.now())
  requestTimes.set(userId, userRequests)
}

function getResearchPrompt(profile: any): string {
  
  return `Please conduct comprehensive research on the following professional:

Profile: ${JSON.stringify(profile, null, 2)}

Please provide:
1. Company background and recent news
2. Industry trends and challenges
3. Professional background and achievements
4. Recent social media activity or public statements
5. Potential pain points or interests relevant to business outreach
6. Key talking points for personalized outreach

Format the response as a detailed research summary that can be used for personalized email outreach.`
}

async function conductPerplexityResearch(profile: any): Promise<string> {
  const prompt = getResearchPrompt(profile)
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful research assistant that conducts thorough professional research for business outreach purposes.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Perplexity API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

async function updateGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  profileId: string | number,
  researchData: string
) {
  // First, get the current sheet data to find the row and research column
  const sheetResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  )

  if (!sheetResponse.ok) {
    throw new Error('Failed to fetch sheet data for update')
  }

  const sheetData = await sheetResponse.json()
  const rows = sheetData.values || []
  
  if (rows.length === 0) {
    throw new Error('Sheet is empty')
  }

  const headers = rows[0]
  let researchColumnIndex = headers.findIndex((h: string) => h.toLowerCase() === 'research')
  
  // If research column doesn't exist, add it
  if (researchColumnIndex === -1) {
    headers.push('research')
    researchColumnIndex = headers.length - 1
    
    // Update the header row
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [headers]
        }),
      }
    )
  }

  // Find the row for this profile (assuming first column is ID)
  const profileRowIndex = rows.findIndex((row: any[], index: number) => 
    index > 0 && row[0] == profileId
  )

  if (profileRowIndex === -1) {
    throw new Error(`Profile with ID ${profileId} not found in sheet`)
  }

  // Update the research column for this profile
  const range = `${sheetName}!${String.fromCharCode(65 + researchColumnIndex)}${profileRowIndex + 1}`
  
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[researchData]]
      }),
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { profiles, spreadsheetId, sheetName } = await request.json()

    if (!profiles || !Array.isArray(profiles)) {
      return NextResponse.json({ error: 'Invalid profiles data' }, { status: 400 })
    }

    if (!process.env.PERPLEXITY_API_KEY) {
      return NextResponse.json({ error: 'Perplexity API key not configured' }, { status: 500 })
    }

    const userId = session.user?.email || 'unknown'

    // Check rate limiting
    if (!checkRateLimit(userId)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Filter profiles that need research (don't have research data or it's empty)
    const profilesToResearch = profiles.filter(profile => 
      !profile.research || profile.research.trim() === ''
    )

    if (profilesToResearch.length === 0) {
      return NextResponse.json({ 
        message: 'All profiles already have research data',
        completed: profiles.length,
        total: profiles.length
      })
    }

    // Estimate cost
    const estimatedCost = profilesToResearch.length * (
      ESTIMATED_TOKENS_PER_RESEARCH * PERPLEXITY_COST_PER_TOKEN + 
      PERPLEXITY_REQUEST_COST / 1000
    )

    // Start research process
    const results = []
    
    for (let i = 0; i < profilesToResearch.length; i++) {
      const profile = profilesToResearch[i]
      
      try {
        // Record request for rate limiting
        recordRequest(userId)
        
        // Conduct research
        const researchData = await conductPerplexityResearch(profile)
        
        // Update Google Sheet
        if (spreadsheetId && sheetName) {
          await updateGoogleSheet(
            session.accessToken,
            spreadsheetId,
            sheetName,
            profile.id,
            researchData
          )
        }

        results.push({
          profileId: profile.id,
          name: profile.name,
          success: true,
          research: researchData
        })

        // Small delay to respect rate limits
        if (i < profilesToResearch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500))
        }

      } catch (error) {
        console.error(`Research failed for profile ${profile.id}:`, error)
        results.push({
          profileId: profile.id,
          name: profile.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      results,
      completed: results.filter(r => r.success).length,
      total: profilesToResearch.length,
      estimatedCost,
      skipped: profiles.length - profilesToResearch.length
    })

  } catch (error) {
    console.error('Research API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Cost estimation endpoint
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const profileCount = parseInt(url.searchParams.get('profileCount') || '0')

    if (profileCount <= 0) {
      return NextResponse.json({ estimatedCost: 0 })
    }

    const estimatedCost = profileCount * (
      ESTIMATED_TOKENS_PER_RESEARCH * PERPLEXITY_COST_PER_TOKEN + 
      PERPLEXITY_REQUEST_COST / 1000
    )

    return NextResponse.json({
      estimatedCost: Math.round(estimatedCost * 100) / 100, // Round to 2 decimal places
      profileCount,
      costPerProfile: Math.round((estimatedCost / profileCount) * 100) / 100
    })

  } catch (error) {
    console.error('Cost estimation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 