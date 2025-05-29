import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { spreadsheetId, sheetName, rowIndex, columnIndex, value } = await request.json()

    // Convert to A1 notation for the cell update
    const columnLetter = String.fromCharCode(65 + columnIndex)
    const cellRow = rowIndex + 2 // +1 for header row, +1 for 1-indexed
    const cellRange = `${sheetName}!${columnLetter}${cellRow}`

    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          values: [[value]]
        }),
      }
    )

    if (!updateResponse.ok) {
      throw new Error('Failed to update Google Sheet')
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error updating cell:', error)
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update cell' 
    }, { status: 500 })
  }
} 