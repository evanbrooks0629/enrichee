import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from "@/lib/auth"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ spreadsheetId: string; sheetName: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { columnName } = await request.json()
    const { spreadsheetId, sheetName } = await params

    // First, get the current sheet data to check if column exists
    const sheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`,
      {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
        },
      }
    )

    if (!sheetResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch sheet headers' }, { status: 500 })
    }

    const sheetData = await sheetResponse.json()
    const headers = sheetData.values?.[0] || []

    // Check if column already exists
    if (headers.includes(columnName)) {
      return NextResponse.json({ 
        message: 'Column already exists', 
        columnIndex: headers.indexOf(columnName),
        headers 
      })
    }

    // Add the new column header
    const newHeaders = [...headers, columnName]
    
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [newHeaders]
        }),
      }
    )

    if (!updateResponse.ok) {
      return NextResponse.json({ error: 'Failed to add column' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Column added successfully',
      columnIndex: newHeaders.length - 1,
      headers: newHeaders
    })

  } catch (error) {
    console.error('Error adding column:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 