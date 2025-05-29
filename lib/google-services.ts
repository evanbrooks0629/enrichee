import { google } from "googleapis"
import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { sheets_v4, drive_v3, gmail_v1 } from "googleapis"

// Type definitions
interface SpreadsheetFile {
  id: string
  name: string
  modified: string
}

interface SheetInfo {
  id: number
  name: string
  index: number
}

interface Profile {
  id?: string
  [key: string]: string | undefined
}

interface DraftInfo {
  id: string
  subject: string
  snippet: string
  created: string
}

interface SendResult {
  messageId?: string
  success: boolean
}

export class GoogleSheetsService {
  private sheets: sheets_v4.Sheets
  private drive: drive_v3.Drive
  private auth: InstanceType<typeof google.auth.OAuth2>
  private session: unknown

  constructor(accessToken: string, refreshToken?: string) {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + '/api/auth/callback/google'
    )
    
    const credentials: { access_token: string; refresh_token?: string } = { 
      access_token: accessToken
    }
    
    if (refreshToken) {
      credentials.refresh_token = refreshToken
    }
    
    this.auth.setCredentials(credentials)
    
    this.sheets = google.sheets({ version: "v4", auth: this.auth })
    this.drive = google.drive({ version: "v3", auth: this.auth })
  }

  private async refreshTokenIfNeeded() {
    try {
      console.log('Current credentials:', {
        hasAccessToken: !!this.auth.credentials.access_token,
        hasRefreshToken: !!this.auth.credentials.refresh_token
      })
      
      // First, check if we have a refresh token
      if (!this.auth.credentials.refresh_token) {
        throw new Error('No refresh token available')
      }

      // Try to get a fresh access token
      const { credentials } = await this.auth.refreshAccessToken()
      
      if (!credentials.access_token) {
        throw new Error('Failed to get new access token')
      }
      
      // Set the new credentials
      this.auth.setCredentials(credentials)
      console.log('Token refreshed successfully')
      
      return credentials.access_token
    } catch (error) {
      console.error('Failed to refresh token:', error)
      throw new Error('Authentication failed - please re-login')
    }
  }

  async listSpreadsheets(): Promise<SpreadsheetFile[]> {
    try {
      const response = await this.drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        pageSize: 100,
        fields: "files(id, name, modifiedTime)",
      })

      return response.data.files?.map((file) => ({
        id: file.id || '',
        name: file.name || '',
        modified: file.modifiedTime || '',
      })).filter((file): file is SpreadsheetFile => 
        file.id !== '' && file.name !== '' && file.modified !== ''
      ) || []
    } catch (error: unknown) {
      const apiError = error as { code?: number }
      if (apiError.code === 401) {
        console.log('Access token expired, attempting refresh...')
        await this.refreshTokenIfNeeded()
        
        // Retry the request with refreshed token
        const response = await this.drive.files.list({
          q: "mimeType='application/vnd.google-apps.spreadsheet'",
          pageSize: 100,
          fields: "files(id, name, modifiedTime)",
        })

        return response.data.files?.map((file) => ({
          id: file.id || '',
          name: file.name || '',
          modified: file.modifiedTime || '',
        })).filter((file): file is SpreadsheetFile => 
          file.id !== '' && file.name !== '' && file.modified !== ''
        ) || []
      }
      
      console.error("Error listing spreadsheets:", error)
      throw error
    }
  }

  async listSheetsInSpreadsheet(spreadsheetId: string): Promise<SheetInfo[]> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      })

      return response.data.sheets?.map((sheet) => ({
        id: sheet.properties?.sheetId || 0,
        name: sheet.properties?.title || '',
        index: sheet.properties?.index || 0,
      })).filter((sheet): sheet is SheetInfo => 
        sheet.name !== ''
      ) || []
    } catch (error: unknown) {
      const apiError = error as { code?: number }
      if (apiError.code === 401) {
        console.log('Access token expired, attempting refresh...')
        await this.refreshTokenIfNeeded()
        
        // Retry the request with refreshed token
        const response = await this.sheets.spreadsheets.get({
          spreadsheetId,
        })

        return response.data.sheets?.map((sheet) => ({
          id: sheet.properties?.sheetId || 0,
          name: sheet.properties?.title || '',
          index: sheet.properties?.index || 0,
        })).filter((sheet): sheet is SheetInfo => 
          sheet.name !== ''
        ) || []
      }
      
      console.error("Error listing sheets:", error)
      throw error
    }
  }

  async fetchProfiles(spreadsheetId: string, sheetName: string, limit?: number): Promise<Profile[]> {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:Z`,
      })
      console.log("Response:", response.data)

      const rows = response.data.values || []
      if (rows.length === 0) return []
      console.log("Rows:", rows)

      const headers = rows[0] as string[]
      const dataRows = rows.slice(1) as string[][]

      // Check if an ID column exists
      const hasIdColumn = headers.some((header: string) => 
        header.toLowerCase() === 'id'
      )

      // If no ID column exists, add one to the sheet
      if (!hasIdColumn) {
        console.log("No ID column found, adding one to the sheet...")
        
        // Add id header (lowercase)
        const updatedHeaders = ['id', ...headers]
        
        // Add ID values to each data row
        const updatedRows = dataRows.map((row: string[], index: number) => [
          `profile_${index + 1}`,
          ...row
        ])
        
        // Combine headers and data for the update
        const allUpdatedRows = [updatedHeaders, ...updatedRows]
        
        // Update the entire sheet with the new ID column
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1:Z${allUpdatedRows.length}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: allUpdatedRows,
          },
        })
        
        console.log("ID column added to the sheet successfully")
        
        // Return profiles with the new structure
        const profiles = updatedRows.map((row: string[]) => {
          const profile: Profile = {}
          updatedHeaders.forEach((header: string, index: number) => {
            profile[header] = row[index] || ""
          })
          return profile
        })
        
        return limit ? profiles.slice(0, limit) : profiles
      }

      const profiles = dataRows.map((row: string[], index: number) => {
        const profile: Profile = {}
        headers.forEach((header: string, index: number) => {
          profile[header] = row[index] || ""
        })
        
        // Add an id field if it doesn't exist
        if (!profile.id && !profile.Id && !profile.ID) {
          profile.id = `profile_${index + 1}`
        }
        
        return profile
      })

      return limit ? profiles.slice(0, limit) : profiles
    } catch (error: unknown) {
      const apiError = error as { code?: number }
      if (apiError.code === 401) {
        console.log('Access token expired, attempting refresh...')
        await this.refreshTokenIfNeeded()
        
        // Retry the request with refreshed token
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A1:Z`,
        })
        
        const rows = response.data.values || []
        if (rows.length === 0) return []

        const headers = rows[0] as string[]
        const dataRows = rows.slice(1) as string[][]

        // Check if an ID column exists
        const hasIdColumn = headers.some((header: string) => 
          header.toLowerCase() === 'id'
        )

        // If no ID column exists, add one to the sheet
        if (!hasIdColumn) {
          console.log("No ID column found, adding one to the sheet...")
          
          // Add id header (lowercase)
          const updatedHeaders = ['id', ...headers]
          
          // Add ID values to each data row
          const updatedRows = dataRows.map((row: string[], index: number) => [
            `profile_${index + 1}`,
            ...row
          ])
          
          // Combine headers and data for the update
          const allUpdatedRows = [updatedHeaders, ...updatedRows]
          
          // Update the entire sheet with the new ID column
          await this.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1:Z${allUpdatedRows.length}`,
            valueInputOption: 'RAW',
            requestBody: {
              values: allUpdatedRows,
            },
          })
          
          console.log("ID column added to the sheet successfully")
          
          // Return profiles with the new structure
          const profiles = updatedRows.map((row: string[]) => {
            const profile: Profile = {}
            updatedHeaders.forEach((header: string, index: number) => {
              profile[header] = row[index] || ""
            })
            return profile
          })
          
          return limit ? profiles.slice(0, limit) : profiles
        }

        const profiles = dataRows.map((row: string[], index: number) => {
          const profile: Profile = {}
          headers.forEach((header: string, index: number) => {
            profile[header] = row[index] || ""
          })
          
          if (!profile.id && !profile.Id && !profile.ID) {
            profile.id = `profile_${index + 1}`
          }
          
          return profile
        })

        return limit ? profiles.slice(0, limit) : profiles
      }
      
      console.error("Error fetching profiles:", error)
      throw error
    }
  }

  async batchUpdateCells(spreadsheetId: string, requests: sheets_v4.Schema$Request[]): Promise<void> {
    try {
      await this.refreshTokenIfNeeded()
      
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      })
    } catch (error) {
      console.error("Error updating cells:", error)
      throw error
    }
  }
}

export class GmailService {
  private gmail: gmail_v1.Gmail
  private auth: InstanceType<typeof google.auth.OAuth2>

  constructor(accessToken: string, refreshToken?: string) {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL + '/api/auth/callback/google'
    )
    
    this.auth.setCredentials({ 
      access_token: accessToken,
      refresh_token: refreshToken
    })
    
    this.gmail = google.gmail({ version: "v1", auth: this.auth })
  }

  private async refreshTokenIfNeeded(): Promise<string | null> {
    try {
      const tokenInfo = await this.auth.getAccessToken()
      if (!tokenInfo.token) {
        throw new Error('No valid access token')
      }
    } catch {
      console.log('Gmail access token invalid, attempting refresh...')
      try {
        const { credentials } = await this.auth.refreshAccessToken()
        this.auth.setCredentials(credentials)
        console.log('Gmail token refreshed successfully')
        return credentials.access_token || null
      } catch (refreshError) {
        console.error('Failed to refresh Gmail token:', refreshError)
        throw new Error('Gmail authentication failed - please re-login')
      }
    }
    return null
  }

  async createDraft(profile: Profile, emailContent: string, subjectPrefix: string = ""): Promise<string | undefined> {
    try {
      await this.refreshTokenIfNeeded()
      
      // Extract recipient email
      const recipientEmail = profile.email || profile.Email || profile.email_address || profile.contact_email

      // Parse email content and normalize line breaks
      const normalizedContent = emailContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const lines = normalizedContent.trim().split('\n')
      let subjectLine: string | null = null
      let bodyLines: string[] = []

      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i]
        if (line.toLowerCase().trim().startsWith('subject:')) {
          subjectLine = line.substring(8).trim()
          bodyLines = lines.slice(i + 1)
          break
        }
      }

      if (!subjectLine) {
        bodyLines = lines
        const companyName = profile.company || profile.Company || 'Your Company'
        subjectLine = `Partnership Opportunity - ${companyName}`
      }

      if (subjectPrefix) {
        subjectLine = `${subjectPrefix}${subjectLine}`
      }

      // Remove leading empty lines and convert to HTML
      const trimmedBodyLines = bodyLines.filter((line, index) => {
        // Remove leading empty lines
        if (index === 0 || bodyLines.slice(0, index).every(l => l.trim() === '')) {
          return line.trim() !== ''
        }
        return true
      })

      // Find where the signature starts (look for common signature patterns)
      let signatureStartIndex = -1
      for (let i = trimmedBodyLines.length - 1; i >= 0; i--) {
        const line = trimmedBodyLines[i].trim()
        if (line.match(/^(Best|Regards|Sincerely|Thanks|Cheers|Best regards|Kind regards),?$/i) ||
            line.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/)) { // Name pattern like "John Smith"
          signatureStartIndex = i
          break
        }
      }

      let bodyContent = ''
      let signatureContent = ''
      let htmlBody = ''

      if (signatureStartIndex !== -1) {
        // Split body and signature
        const bodyLines = trimmedBodyLines.slice(0, signatureStartIndex)
        const sigLines = trimmedBodyLines.slice(signatureStartIndex)

        // Process body with paragraph spacing
        bodyContent = bodyLines
          .map(line => line.trim())
          .filter(line => line !== '')
          .join('<br><br>')

        // Process signature with single line breaks to preserve formatting
        signatureContent = sigLines
          .map(line => line.trim())
          .filter(line => line !== '')
          .join('<br>')

        // Combine with single spacing between body and signature
        htmlBody = bodyContent + '<br><br>' + signatureContent
      } else {
        // No signature detected, treat everything as body
        htmlBody = trimmedBodyLines
          .map(line => line.trim())
          .filter(line => line !== '')
          .join('<br><br>')
      }

      // Clean up any problematic characters before encoding
      const cleanSubject = subjectLine.replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"').replace(/–/g, '-').replace(/—/g, '-')
      const cleanHtmlBody = htmlBody.replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"').replace(/–/g, '-').replace(/—/g, '-')

      // Create HTML email message
      const message = [
        `MIME-Version: 1.0`,
        `To: ${recipientEmail}`,
        `Subject: ${cleanSubject}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: quoted-printable`,
        '',
        `<html><body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">`,
        cleanHtmlBody,
        `</body></html>`
      ].join('\r\n')

      // Encode as base64url (Gmail's preferred format)
      const encodedMessage = Buffer.from(message, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      const draft = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: encodedMessage,
          },
        },
      })

      return draft.data.id || undefined
    } catch (error) {
      console.error("Error creating Gmail draft:", error)
      throw error
    }
  }

  async listRecentDrafts(maxResults: number = 10): Promise<DraftInfo[]> {
    try {
      await this.refreshTokenIfNeeded()
      
      const response = await this.gmail.users.drafts.list({
        userId: 'me',
        maxResults,
      })

      const drafts = response.data.drafts || []
      const detailedDrafts: DraftInfo[] = []

      for (const draft of drafts.slice(0, 5)) {
        try {
          if (!draft.id) continue
          
          const draftDetail = await this.gmail.users.drafts.get({
            userId: 'me',
            id: draft.id,
          })

          const message = draftDetail.data.message
          const headers = message?.payload?.headers || []
          
          let subject = "No Subject"
          for (const header of headers) {
            if (header.name === 'Subject') {
              subject = header.value || "No Subject"
              break
            }
          }

          let snippet = message?.snippet || ''
          if (snippet.length > 100) {
            snippet = snippet.substring(0, 100) + "..."
          }

          detailedDrafts.push({
            id: draft.id,
            subject,
            snippet,
            created: message?.internalDate || '',
          })
        } catch (draftError) {
          console.error("Error getting draft details:", draftError)
          continue
        }
      }

      return detailedDrafts
    } catch (error) {
      console.error("Error listing drafts:", error)
      throw error
    }
  }

  async updateAndSendDraft(draftId: string, updatedContent: string, recipientEmail: string): Promise<SendResult> {
    try {
      await this.refreshTokenIfNeeded()

      // Parse the updated content similar to createDraft
      const normalizedContent = updatedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const lines = normalizedContent.trim().split('\n')
      let subjectLine: string | null = null
      let bodyLines: string[] = []

      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i]
        if (line.toLowerCase().trim().startsWith('subject:')) {
          subjectLine = line.substring(8).trim()
          bodyLines = lines.slice(i + 1)
          break
        }
      }

      if (!subjectLine) {
        bodyLines = lines
        subjectLine = `Partnership Opportunity`
      }

      // Process content same as createDraft
      const trimmedBodyLines = bodyLines.filter((line, index) => {
        if (index === 0 || bodyLines.slice(0, index).every(l => l.trim() === '')) {
          return line.trim() !== ''
        }
        return true
      })

      // Handle signature detection and formatting (same logic as createDraft)
      let signatureStartIndex = -1
      for (let i = trimmedBodyLines.length - 1; i >= 0; i--) {
        const line = trimmedBodyLines[i].trim()
        if (line.match(/^(Best|Regards|Sincerely|Thanks|Cheers|Best regards|Kind regards),?$/i) ||
            line.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/)) {
          signatureStartIndex = i
          break
        }
      }

      let htmlBody = ''
      if (signatureStartIndex !== -1) {
        const bodyLines = trimmedBodyLines.slice(0, signatureStartIndex)
        const sigLines = trimmedBodyLines.slice(signatureStartIndex)

        const bodyContent = bodyLines
          .map(line => line.trim())
          .filter(line => line !== '')
          .join('<br><br>')

        const signatureContent = sigLines
          .map(line => line.trim())
          .filter(line => line !== '')
          .join('<br>')

        htmlBody = bodyContent + '<br><br>' + signatureContent
      } else {
        htmlBody = trimmedBodyLines
          .map(line => line.trim())
          .filter(line => line !== '')
          .join('<br><br>')
      }

      // Clean up characters
      const cleanSubject = subjectLine.replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"').replace(/–/g, '-').replace(/—/g, '-')
      const cleanHtmlBody = htmlBody.replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"').replace(/–/g, '-').replace(/—/g, '-')

      // Create updated message
      const message = [
        `MIME-Version: 1.0`,
        `To: ${recipientEmail}`,
        `Subject: ${cleanSubject}`,
        `Content-Type: text/html; charset=UTF-8`,
        `Content-Transfer-Encoding: quoted-printable`,
        '',
        `<html><body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">`,
        cleanHtmlBody,
        `</body></html>`
      ].join('\r\n')

      const encodedMessage = Buffer.from(message, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      // Update the draft
      await this.gmail.users.drafts.update({
        userId: 'me',
        id: draftId,
        requestBody: {
          message: {
            raw: encodedMessage,
          },
        },
      })

      // Send the draft
      const sentMessage = await this.gmail.users.drafts.send({
        userId: 'me',
        requestBody: {
          id: draftId,
        },
      })

      return {
        messageId: sentMessage.data.id || undefined,
        success: true
      }

    } catch (error) {
      console.error("Error updating and sending draft:", error)
      throw error
    }
  }
}

export async function getGoogleServices() {
  const session = await getServerSession(authOptions)
  
  if (!session?.accessToken) {
    throw new Error("No access token available")
  }

  return {
    sheets: new GoogleSheetsService(session.accessToken, session.refreshToken),
    gmail: new GmailService(session.accessToken, session.refreshToken),
  }
} 