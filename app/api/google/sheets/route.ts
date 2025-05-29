import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleSheetsService } from "@/lib/google-services"

interface Error {
  message?: string
  status?: number
}

export async function GET() {
  
  try {
    console.log("Attempting to get server session...")
    const session = await getServerSession(authOptions)
    
    if (!session || !session.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sheetsService = new GoogleSheetsService(session.accessToken, session.refreshToken)
    
    const spreadsheets = await sheetsService.listSpreadsheets()
    
    return NextResponse.json({ 
      spreadsheets: spreadsheets.map((file) => ({
        id: file.id,
        name: file.name
      }))
    })
  } catch (error: unknown) {
    const errorObject = error as Error
    // Handle specific authentication errors
    if (errorObject.message?.includes('Authentication failed') || errorObject.status === 401) {
      return NextResponse.json({ 
        error: 'Authentication expired. Please sign out and sign back in.' 
      }, { status: 401 })
    }
    
    return NextResponse.json({ 
      error: 'Failed to fetch spreadsheets',
      details: errorObject.message 
    }, { status: 500 })
  }
} 