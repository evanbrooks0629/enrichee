import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { GoogleSheetsService } from "@/lib/google-services"

export async function GET(request: Request, { params }: { params: Promise<{ spreadsheetId: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const sheetsService = new GoogleSheetsService(session.accessToken)
    const { spreadsheetId } = await params
    const sheets = await sheetsService.listSheetsInSpreadsheet(spreadsheetId)

    return NextResponse.json({ sheets })
  } catch (error) {
    console.error("Error fetching sheets:", error)
    return NextResponse.json({ error: "Failed to fetch sheets" }, { status: 500 })
  }
} 