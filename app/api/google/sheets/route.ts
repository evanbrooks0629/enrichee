import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleSheetsService } from "@/lib/google-services"

export async function GET(request: NextRequest) {
  console.log("API route hit - starting execution")
  
  try {
    console.log("Attempting to get server session...")
    const session = await getServerSession(authOptions)
    
    if (!session || !session.accessToken) {
      console.log("No session or access token found")
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log("Session retrieved:", {
      exists: !!session,
      user: session.user?.email,
      hasAccessToken: !!session.accessToken,
      hasRefreshToken: !!session.refreshToken,
      accessTokenLength: session.accessToken?.length,
      refreshTokenLength: session.refreshToken?.length,
      sessionKeys: Object.keys(session)
    })

    console.log("Creating GoogleSheetsService...")
    const sheetsService = new GoogleSheetsService(session.accessToken, session.refreshToken)
    
    console.log("Calling listSpreadsheets...")
    const spreadsheets = await sheetsService.listSpreadsheets()
    
    console.log("Successfully retrieved spreadsheets:", spreadsheets.length)
    return NextResponse.json({ 
      spreadsheets: spreadsheets.map((file: any) => ({
        id: file.id,
        name: file.name
      }))
    })
  } catch (error: any) {
    console.error('Error in API route:', error)
    
    // Handle specific authentication errors
    if (error.message?.includes('Authentication failed') || error.status === 401) {
      return NextResponse.json({ 
        error: 'Authentication expired. Please sign out and sign back in.' 
      }, { status: 401 })
    }
    
    return NextResponse.json({ 
      error: 'Failed to fetch spreadsheets',
      details: error.message 
    }, { status: 500 })
  }
} 