import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleSheetsService } from "@/lib/google-services"

export async function GET(request: Request, { params }: { params: Promise<{ spreadsheetId: string, sheetName: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sheetsService = new GoogleSheetsService(session.accessToken)
    const { spreadsheetId, sheetName } = await params
    
    // Add your logic to fetch data from the specific sheet
    // const range = `${sheetName}!A1:Z`;
    const sheetData = await sheetsService.fetchProfiles(spreadsheetId, sheetName);

    return NextResponse.json({ profiles: sheetData })
  } catch (error) {
    console.error("Error fetching sheet data:", error)
    return NextResponse.json({ error: "Failed to fetch sheet data" }, { status: 500 })
  }
} 