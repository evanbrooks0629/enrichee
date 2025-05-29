"use client"

import { useState, useEffect, useMemo } from "react"
import { useSession, signIn, signOut } from "next-auth/react"
import { Profile } from "@/types/profile"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  SidebarInset,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Edit3,
  Save,
  FileSpreadsheet,
  User,
  DollarSign,
  Play,
  Pause,
  RefreshCcw,
  AlertCircle,
} from "lucide-react"

interface File {
  id: string
  name: string
}

interface Sheet {
  id: string
  name: string
}

interface ResearchResult {
  success: boolean
  profileId: string
  name: string
  research?: string
  error?: string
  cost?: number
}

interface EmailResult {
  success: boolean
  profileId: string
  name: string
  emailDraft?: string
  gmailDraftId?: string
  error?: string
  cost?: number
}

export default function CustomerResearchApp() {
  const { data: session, status } = useSession()
  const [selectedFile, setSelectedFile] = useState("")
  const [selectedSheet, setSelectedSheet] = useState("")
  const [availableFiles, setAvailableFiles] = useState([])
  const [availableSheets, setAvailableSheets] = useState([])
  const [customerData, setCustomerData] = useState<Profile[]>([])
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([])
  const [isLoadingSheetData, setIsLoadingSheetData] = useState(false)
  const [isLoadingSpreadsheets, setIsLoadingSpreadsheets] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(
    `You are a top-tier growth representative writing a cold outreach email from a boutique AI consulting firm made up of three top-tier AI engineers. Our mission: bring the same AI power that only big real-estate firms can afford today to mid-sized and smaller developers.

Your goal is to get a meeting with the person described in the profile data. Make it personal and show that you have done your homework. Be warm and concise, with a touch of humour and persuasion. Do not make any generic statements, such as 'Your role as a [role] at [company] is important to us', or 'I hope this email finds you well'.

Don't be overly salesy or sycophantic. Do not use em-dashes, or '-'. In the subject line, do not use any special characters, apostrophes, or dashes. Only use text.

Some things that we can do is automate some of their repetitive tasks.

<RULE> The subject line of the email should be formatted as "Subject: {subject line}" </RULE>
<RULE> The body of the email should be no more than 150 words. </RULE>`
  )
  const [emailSignature, setEmailSignature] = useState("Evan Brooks\nSr. Engineer, DevelopIQ\nevan@developiq.ai\n561.789.8905\nwww.developiq.ai")
  const [isEditingPrompt, setIsEditingPrompt] = useState(false)
  const [isEditingSignature, setIsEditingSignature] = useState(false)
  const [researchProgress, setResearchProgress] = useState(0)
  const [emailProgress, setEmailProgress] = useState(0)
  const [isResearchRunning, setIsResearchRunning] = useState(false)
  const [isEmailGenerating, setIsEmailGenerating] = useState(false)
  const [researchResults, setResearchResults] = useState<ResearchResult[]>([])
  const [researchError, setResearchError] = useState("")
  const [researchCost, setResearchCost] = useState(0)
  const [currentResearchProfile, setCurrentResearchProfile] = useState("")
  const [emailResults, setEmailResults] = useState<EmailResult[]>([])
  const [emailError, setEmailError] = useState("")
  const [emailCost, setEmailCost] = useState(0)
  const [currentEmailProfile, setCurrentEmailProfile] = useState("")
  const [currentDraftIndex, setCurrentDraftIndex] = useState(0)
  const [currentDraftContent, setCurrentDraftContent] = useState("")
  const [profilesWithDrafts, setProfilesWithDrafts] = useState<Profile[]>([])
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isUnauthorized, setIsUnauthorized] = useState(false)

  useEffect(() => {
    const savedSystemPrompt = localStorage.getItem('enrichee-system-prompt')
    const savedEmailSignature = localStorage.getItem('enrichee-email-signature')
    
    if (savedSystemPrompt) {
      setSystemPrompt(savedSystemPrompt)
    }
    
    if (savedEmailSignature) {
      setEmailSignature(savedEmailSignature)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('enrichee-system-prompt', systemPrompt)
  }, [systemPrompt])

  useEffect(() => {
    localStorage.setItem('enrichee-email-signature', emailSignature)
  }, [emailSignature])

  useEffect(() => {
    if (session) {
      fetchSpreadsheets()
    }
  }, [session])

  useEffect(() => {
    if (selectedFile) {
      fetchSheets(selectedFile)
    }
  }, [selectedFile])

  useEffect(() => {
    console.log("Client-side session:", session)
    console.log("Session status:", status)
  }, [session, status])

  useEffect(() => {
    if (selectedFile && selectedSheet) {
      fetchSheetData(selectedFile, selectedSheet)
    } else {
      console.log("No selected file or sheet")
    }
  }, [selectedFile, selectedSheet])

  useEffect(() => {
    if (customerData.length > 0) {
      updateCostEstimate()
      updateEmailCostEstimate()
    }
  }, [customerData])

  useEffect(() => {
    const profiles = customerData.filter(profile => 
      profile.drafts && profile.drafts.trim() !== ''
    )
    setProfilesWithDrafts(profiles)
    
    if (profiles.length > 0 && currentDraftIndex >= profiles.length) {
      setCurrentDraftIndex(0)
    }
  }, [customerData, currentDraftIndex])

  useEffect(() => {
    if (profilesWithDrafts.length > 0 && profilesWithDrafts[currentDraftIndex]) {
      setCurrentDraftContent(profilesWithDrafts[currentDraftIndex].drafts || "")
    }
  }, [currentDraftIndex, profilesWithDrafts])

  useEffect(() => {
    if (session?.user?.email && !session.user.email.endsWith('@developiq.ai')) {
      setIsUnauthorized(true)
      signOut({ redirect: false })
    } else if (session?.user?.email?.endsWith('@developiq.ai')) {
      setIsUnauthorized(false)
    }
  }, [session])

  const fetchSpreadsheets = async () => {
    setIsLoadingSpreadsheets(true)
    try {
      const response = await fetch('/api/google/sheets', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        console.error('Response not ok:', response.status, response.statusText)
        const errorData = await response.json()
        console.error('Error data:', errorData)
        return
      }
      
      const data = await response.json()
      setAvailableFiles(data.spreadsheets || [])
      
    } catch (error) {
      console.error("Error fetching spreadsheets:", error)
    } finally {
      setIsLoadingSpreadsheets(false)
    }
  }

  const fetchSheets = async (spreadsheetId: string) => {
    try {
      const response = await fetch(`/api/google/sheets/${spreadsheetId}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        console.error('Error fetching sheets:', response.status, response.statusText)
        const errorData = await response.json()
        console.error('Error data:', errorData)
        
        if (response.status === 401) {
          console.log('Auth error, refreshing spreadsheets...')
          await fetchSpreadsheets()
        }
        return
      }
      
      const data = await response.json()
      setAvailableSheets(data.sheets || [])
    } catch (error) {
      console.error("Error fetching sheets:", error)
    }
  }

  const fetchSheetData = async (spreadsheetId: string, sheetName: string) => {
    setIsLoadingSheetData(true)
    try {
      const response = await fetch(`/api/google/sheets/${spreadsheetId}/${encodeURIComponent(sheetName)}`)
      
      if (!response.ok) {
        console.error('Error fetching sheet data:', response.status, response.statusText)
        return
      }
      
      const data = await response.json()
      
      if (data.profiles && data.profiles.length > 0) {
        const headers = Object.keys(data.profiles[0])
        setSheetHeaders(headers)
        setCustomerData(data.profiles)
      } else {
        console.error("No profiles found in sheet data")
        setSheetHeaders([])
        setCustomerData([])
      }
    } catch (error) {
      console.error("Error fetching sheet data:", error)
      setSheetHeaders([])
      setCustomerData([])
    } finally {
      setIsLoadingSheetData(false)
    }
  }

  const handleGoogleLogin = () => {
    signIn("google")
  }

  const handleFileSelect = (fileId: string) => {
    setSelectedFile(fileId)
    setSelectedSheet("")
  }

  const handleSheetSelect = (sheetName: string) => {
    setSelectedSheet(sheetName)
  }

  const updateCostEstimate = async () => {
    try {
      const profilesToResearch = customerData.filter(profile => 
        !profile.research || profile.research.trim() === ''
      )
      
      if (profilesToResearch.length === 0) {
        setResearchCost(0)
        return
      }

      const response = await fetch(`/api/research?profileCount=${profilesToResearch.length}`)
      if (response.ok) {
        const data = await response.json()
        setResearchCost(data.estimatedCost)
      }
    } catch (error) {
      console.error('Error estimating cost:', error)
    }
  }

  const updateEmailCostEstimate = async () => {
    try {
      const profilesToEmail = customerData.filter(profile => 
        profile.research && profile.research.trim() !== '' &&
        (!profile.drafts || profile.drafts.trim() === '')
      )
      
      if (profilesToEmail.length === 0) {
        setEmailCost(0)
        return
      }

      const estimatedCost = profilesToEmail.length * 0.015
      setEmailCost(estimatedCost)
    } catch (error) {
      console.error('Error estimating email cost:', error)
    }
  }

  const startResearch = async () => {
    if (!selectedFile || !selectedSheet || customerData.length === 0) {
      setResearchError("Please select a sheet with customer data first")
      return
    }

    setIsResearchRunning(true)
    setResearchProgress(0)
    setResearchError("")
    setResearchResults([])

    try {
      const addColumnResponse = await fetch(`/api/google/sheets/${selectedFile}/${encodeURIComponent(selectedSheet)}/add-column`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          columnName: 'research'
        }),
      })

      if (!addColumnResponse.ok) {
        throw new Error('Failed to add research column')
      }

      const columnData = await addColumnResponse.json()
      const researchColumnIndex = columnData.columnIndex

      if (!sheetHeaders.includes('research')) {
        setSheetHeaders(prev => [...prev, 'research'])
      }

      const profilesToResearch = customerData.filter(profile => 
        !profile.research || profile.research.trim() === ''
      )

      if (profilesToResearch.length === 0) {
        setResearchError("All profiles already have research data")
        setIsResearchRunning(false)
        return
      }

      const results = []
      for (let i = 0; i < profilesToResearch.length; i++) {
        const profile = profilesToResearch[i]
        const rowIndex = customerData.findIndex(p => p.id === profile.id)
        
        setCurrentResearchProfile(profile.name || '')
        setResearchProgress((i / profilesToResearch.length) * 100)

        try {
          const response = await fetch('/api/research/profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              profile,
              spreadsheetId: selectedFile,
              sheetName: selectedSheet,
              rowIndex,
              columnIndex: researchColumnIndex
            }),
          })

          const result = await response.json()
          results.push(result)

          if (result.success && result.research) {
            setCustomerData(prevData => 
              prevData.map(p => 
                p.id === profile.id 
                  ? { ...p, research: result.research }
                  : p
              )
            )
          }

          await new Promise(resolve => setTimeout(resolve, 500))

        } catch (error) {
          console.error(`Error researching ${profile.name}:`, error)
          results.push({
            success: false,
            profileId: profile.id,
            name: profile.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      setResearchResults(results)
      setResearchProgress(100)
      setCurrentResearchProfile('')

      const successCount = results.filter(r => r.success).length
      if (successCount < profilesToResearch.length) {
        setResearchError(`Completed ${successCount}/${profilesToResearch.length} profiles. Some research requests failed.`)
      }

    } catch (error) {
      console.error('Research error:', error)
      setResearchError(error instanceof Error ? error.message : 'Research failed')
    } finally {
      setIsResearchRunning(false)
      setCurrentResearchProfile('')
    }
  }

  const startEmailGeneration = async () => {
    if (!selectedFile || !selectedSheet || customerData.length === 0) {
      setEmailError("Please select a sheet with customer data first")
      return
    }

    const profilesWithoutResearch = customerData.filter(profile => 
      !profile.research || profile.research.trim() === ''
    )

    if (profilesWithoutResearch.length > 0) {
      setEmailError("Complete the research phase first for all profiles")
      return
    }

    setIsEmailGenerating(true)
    setEmailProgress(0)
    setEmailError("")
    setEmailResults([])

    try {
      const addColumnResponse = await fetch(`/api/google/sheets/${selectedFile}/${encodeURIComponent(selectedSheet)}/add-column`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          columnName: 'drafts'
        }),
      })

      if (!addColumnResponse.ok) {
        throw new Error('Failed to add drafts column')
      }

      const columnData = await addColumnResponse.json()
      const draftsColumnIndex = columnData.columnIndex

      if (!sheetHeaders.includes('drafts')) {
        setSheetHeaders(prev => [...prev, 'drafts'])
      }

      const profilesToEmail = customerData.filter(profile => 
        profile.research && profile.research.trim() !== '' &&
        (!profile.drafts || profile.drafts.trim() === '')
      )

      if (profilesToEmail.length === 0) {
        setEmailError("All profiles already have email drafts")
        setIsEmailGenerating(false)
        return
      }

      const results = []
      
      for (let i = 0; i < profilesToEmail.length; i++) {
        const profile = profilesToEmail[i]
        const rowIndex = customerData.findIndex(p => p.id === profile.id)
        
        setCurrentEmailProfile(profile.name || '')
        setEmailProgress((i / profilesToEmail.length) * 100)

        try {
          const response = await fetch('/api/email/profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              profile,
              systemPrompt,
              emailSignature,
              spreadsheetId: selectedFile,
              sheetName: selectedSheet,
              rowIndex,
              columnIndex: draftsColumnIndex
            }),
          })

          const result = await response.json()
          results.push(result)

          if (result.success && result.emailDraft) {
            setCustomerData(prevData => 
              prevData.map(p => 
                p.id === profile.id 
                  ? { 
                      ...p, 
                      drafts: result.emailDraft,
                      gmailDraftId: result.gmailDraftId 
                    }
                  : p
              )
            )
          }

          await new Promise(resolve => setTimeout(resolve, 1000))

        } catch (error) {
          console.error(`Error generating email for ${profile.name}:`, error)
          results.push({
            success: false,
            profileId: profile.id,
            name: profile.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      setEmailResults(results)
      setEmailProgress(100)
      setCurrentEmailProfile('')

      const successCount = results.filter(r => r.success).length
      if (successCount < profilesToEmail.length) {
        setEmailError(`Completed ${successCount}/${profilesToEmail.length} email drafts. Some generation requests failed.`)
      }

    } catch (error) {
      console.error('Email generation error:', error)
      setEmailError(error instanceof Error ? error.message : 'Email generation failed')
    } finally {
      setIsEmailGenerating(false)
      setCurrentEmailProfile('')
    }
  }

  const saveDraftChanges = async () => {
    if (profilesWithDrafts.length === 0) return

    const currentProfile = profilesWithDrafts[currentDraftIndex]
    const rowIndex = customerData.findIndex(p => p.id === currentProfile.id)
    const draftsColumnIndex = sheetHeaders.findIndex(header => header === 'drafts')

    if (draftsColumnIndex === -1) return

    try {
      const response = await fetch('/api/google/sheets/update-cell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spreadsheetId: selectedFile,
          sheetName: selectedSheet,
          rowIndex,
          columnIndex: draftsColumnIndex,
          value: currentDraftContent
        }),
      })

      if (response.ok) {
        setCustomerData(prevData => 
          prevData.map(p => 
            p.id === currentProfile.id 
              ? { ...p, drafts: currentDraftContent }
              : p
          )
        )
      }
    } catch (error) {
      console.error('Error saving draft changes:', error)
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (currentDraftContent && profilesWithDrafts[currentDraftIndex]?.drafts !== currentDraftContent) {
        saveDraftChanges()
      }
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [currentDraftContent])

  const nextDraft = () => {
    if (currentDraftIndex < profilesWithDrafts.length - 1) {
      setCurrentDraftIndex(currentDraftIndex + 1)
    }
  }

  const previousDraft = () => {
    if (currentDraftIndex > 0) {
      setCurrentDraftIndex(currentDraftIndex - 1)
    }
  }

  const profilesWithDraftsAndIds = useMemo(() => {
    return customerData.filter(profile => 
      profile.drafts && profile.drafts.trim() !== ''
    ).map(profile => ({
      ...profile,
      // Use the gmail_draft_id from the sheet if available, otherwise fall back to the in-memory one
      gmailDraftId: profile.gmail_draft_id || profile.gmailDraftId
    }))
  }, [customerData])

  const sendEmail = async () => {
    if (profilesWithDraftsAndIds.length === 0) return

    const currentProfile = profilesWithDraftsAndIds[currentDraftIndex] as Profile
    const rowIndex = customerData.findIndex(p => p.id === currentProfile.id)

    // Use the gmail_draft_id from the sheet data
    const gmailDraftId = currentProfile.gmailDraftId

    if (!gmailDraftId) {
      alert('No Gmail draft found for this profile. Please regenerate the email draft.')
      return
    }

    setIsSendingEmail(true)

    try {
      const response = await fetch('/api/email/send-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gmailDraftId: gmailDraftId,
          updatedContent: currentDraftContent,
          recipientEmail: currentProfile.email,
          profileId: currentProfile.id,
          spreadsheetId: selectedFile,
          sheetName: selectedSheet,
          rowIndex
        }),
      })

      const result = await response.json()

      if (result.success) {
        // Update the local state to reflect sent status
        setCustomerData(prevData => 
          prevData.map(p => 
            p.id === currentProfile.id 
              ? { ...p, sent: 'TRUE' }
              : p
          )
        )
        
        alert('Email sent successfully!')
        
        // Move to next draft if available
        if (currentDraftIndex < profilesWithDrafts.length - 1) {
          nextDraft()
        }
      } else {
        // Update the local state to reflect failed status
        setCustomerData(prevData => 
          prevData.map(p => 
            p.id === currentProfile.id 
              ? { ...p, sent: 'FALSE' }
              : p
          )
        )
        
        alert(`Failed to send email: ${result.error}`)
      }
    } catch (error) {
      console.error('Error sending email:', error)
      alert('Error sending email')
    } finally {
      setIsSendingEmail(false)
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (isUnauthorized || (session?.user?.email && !session.user.email.endsWith('@developiq.ai'))) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Card className="w-96 bg-gray-800 border-gray-600">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <CardTitle className="text-white">Access Denied</CardTitle>
            <CardDescription className="text-gray-400">
              You don&apos;t have permission to access this application
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-gray-400">
              Only users with @developiq.ai email addresses are allowed to access Enrichee.
            </p>
            <p className="text-xs text-gray-500">
              Current account: {session?.user?.email}
            </p>
            <Button 
              onClick={() => signOut({ callbackUrl: '/' })}
              variant="outline"
              className="border-gray-600 bg-gray-900 text-gray-300 hover:bg-gray-700 hover:text-white"
            >
              Sign Out & Try Different Account
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Card className="w-96 bg-gray-800 border-gray-600">
          <CardHeader className="text-center">
            <CardTitle className="text-white">Enrichee</CardTitle>
            <CardDescription className="text-gray-400">
              Sign in with DevelopIQ Google Account to access Enrichee
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGoogleLogin} className="w-full bg-blue-600 hover:bg-blue-700">
              <User className="mr-2 h-4 w-4" />
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 overflow-hidden">
      <SidebarProvider>
        <Sidebar className="bg-gray-900 border-gray-700">
          <SidebarHeader className="p-4 border-b border-gray-700 bg-gray-900 flex justify-center flex-col">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
          </SidebarHeader>
          <SidebarContent className="p-4 space-y-6 bg-gray-800 border-gray-600">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">System Prompt</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                  className="text-gray-400 hover:text-gray-900"
                >
                  {isEditingPrompt ? <Save className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                </Button>
              </div>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                disabled={!isEditingPrompt}
                className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                placeholder="Enter your system prompt..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Email Signature</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingSignature(!isEditingSignature)}
                  className="text-gray-400 hover:text-gray-900"
                >
                  {isEditingSignature ? <Save className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                </Button>
              </div>
              <Textarea
                value={emailSignature}
                onChange={(e) => setEmailSignature(e.target.value)}
                disabled={!isEditingSignature}
                className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
                placeholder="Enter your email signature..."
              />
            </div>
          </SidebarContent>
        </Sidebar>

        <SidebarInset className="flex-1 overflow-hidden">
          <div className="p-6 w-full max-w-full overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="text-white" />
                <h1 className="text-2xl font-bold text-white">Enrichee</h1>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-white">
                  <div className="text-right">
                    <p className="text-sm font-medium">{session.user?.name}</p>
                    <p className="text-xs text-gray-400">{session.user?.email}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-600 border border-gray-600 flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {session.user?.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signOut()}
                  className="border-gray-600 bg-gray-900 text-gray-300 hover:bg-gray-700 hover:text-white"
                >
                  Sign Out
                </Button>
              </div>
            </div>

            <Card className="mb-6 bg-gray-800 border-gray-600">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Google Sheets Selection
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-gray-600 bg-gray-900 text-gray-300 hover:bg-gray-700 hover:text-white" 
                    onClick={() => fetchSpreadsheets()}
                    disabled={isLoadingSpreadsheets}
                  >
                    <RefreshCcw className={`h-4 w-4 ${isLoadingSpreadsheets ? 'animate-spin' : ''}`} />
                    {isLoadingSpreadsheets ? 'Loading...' : 'Refresh Sheets'}
                  </Button>
                </div>
                
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Select File</label>
                    <Select value={selectedFile} onValueChange={handleFileSelect}>
                      <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                        <SelectValue placeholder="Choose a Google Sheet file" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {availableFiles.map((file: File) => (
                          <SelectItem key={file.id} value={file.id} className="text-white">
                            {file.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Select Sheet</label>
                    <Select value={selectedSheet} onValueChange={handleSheetSelect} disabled={!selectedFile}>
                      <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                        <SelectValue placeholder="Choose a sheet" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {availableSheets.map((sheet: Sheet) => (
                          <SelectItem key={sheet.id} value={sheet.name} className="text-white">
                            {sheet.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {selectedSheet && (
              <Card className="mb-6 bg-gray-800 border-gray-600 w-full min-w-0">
                <CardHeader>
                  <CardTitle className="text-white">Customer Profiles</CardTitle>
                  <CardDescription className="text-gray-400">Data from {selectedSheet} sheet</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  {isLoadingSheetData ? (
                    <div className="flex items-center justify-center py-8 px-6">
                      <div className="text-white">Loading sheet data...</div>
                    </div>
                  ) : customerData.length > 0 ? (
                    <Table collapsible numRows={customerData.length}>
                      <TableHeader>
                        <TableRow className="border-gray-600">
                          {sheetHeaders.map((header: string, index: number) => (
                            <TableHead key={index} className="text-gray-300">
                              {header}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customerData.map((row: Profile) => (
                          <TableRow key={row.id} className="border-gray-600">
                            {sheetHeaders.map((header: string, index: number) => (
                              <TableCell key={index} className="text-white">
                                {row[header] || ''}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex items-center justify-center py-8 px-6">
                      <div className="text-gray-400">No data found in this sheet</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Tabs defaultValue="research" className="space-y-4">
              <TabsList className="bg-gray-800">
                <TabsTrigger
                  value="research"
                  className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-300"
                >
                  Deep Research
                </TabsTrigger>
                <TabsTrigger
                  value="emails"
                  className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-300"
                >
                  Email Drafts
                </TabsTrigger>
                <TabsTrigger
                  value="review"
                  className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-300"
                >
                  Review & Send
                </TabsTrigger>
              </TabsList>

              <TabsContent value="research">
                <Card className="bg-gray-800 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white">Deep Research</CardTitle>
                    <CardDescription className="text-gray-400">
                      Conduct comprehensive research on customer profiles using Perplexity AI
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-gray-700/50 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-400" />
                      <div>
                        <p className="text-white font-medium">Estimated Cost</p>
                        <p className="text-gray-400 text-sm">
                          ${researchCost.toFixed(2)} for {customerData.filter(p => !p.research || p.research.trim() === '').length} profiles
                        </p>
                      </div>
                    </div>

                    {researchError && (
                      <div className="p-4 bg-red-900/20 border border-red-600 rounded-lg">
                        <p className="text-red-400 text-sm">{researchError}</p>
                      </div>
                    )}

                    {isResearchRunning && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Research Progress</span>
                          <span className="text-gray-300">{Math.round(researchProgress)}%</span>
                        </div>
                        <Progress value={researchProgress} className="bg-gray-700/30" />
                        {currentResearchProfile && (
                          <p className="text-sm text-gray-400">
                            Performing Deep Research on {currentResearchProfile}
                          </p>
                        )}
                      </div>
                    )}

                    {researchResults.length > 0 && !isResearchRunning && (
                      <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
                        <h4 className="text-white font-medium mb-2">Research Results</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {researchResults.map((result, index) => (
                            <div key={index} className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">{result.name}</span>
                              <Badge 
                                variant={result.success ? "default" : "destructive"}
                                className={result.success ? "bg-green-600" : "bg-red-600"}
                              >
                                {result.success ? "✓" : "✗"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={startResearch}
                      disabled={isResearchRunning || !selectedSheet || customerData.length === 0}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600"
                    >
                      {isResearchRunning ? (
                        <>
                          <Pause className="mr-2 h-4 w-4" />
                          Research Running...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Start Research
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="emails">
                <Card className="bg-gray-800 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white">Email Draft Generation</CardTitle>
                    <CardDescription className="text-gray-400">
                      Generate personalized email drafts using research data
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-gray-700/50 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-400" />
                      <div>
                        <p className="text-white font-medium">Estimated Cost</p>
                        <p className="text-gray-400 text-sm">
                          ${emailCost.toFixed(2)} for {customerData.filter(p => 
                            p.research && p.research.trim() !== '' &&
                            (!p.drafts || p.drafts.trim() === '')
                          ).length} email drafts
                        </p>
                      </div>
                    </div>

                    {emailError && (
                      <div className="p-4 bg-red-900/20 border border-red-600 rounded-lg">
                        <p className="text-red-400 text-sm">{emailError}</p>
                      </div>
                    )}

                    {isEmailGenerating && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">Generation Progress</span>
                          <span className="text-gray-300">{Math.round(emailProgress)}%</span>
                        </div>
                        <Progress value={emailProgress} className="bg-gray-700/30" />
                        {currentEmailProfile && (
                          <p className="text-sm text-gray-400">
                            Generating email draft for {currentEmailProfile}
                          </p>
                        )}
                      </div>
                    )}

                    {emailResults.length > 0 && !isEmailGenerating && (
                      <div className="mt-4 p-4 bg-gray-700/50 rounded-lg">
                        <h4 className="text-white font-medium mb-2">Email Generation Results</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {emailResults.map((result, index) => (
                            <div key={index} className="flex items-center justify-between text-sm">
                              <span className="text-gray-300">{result.name}</span>
                              <Badge 
                                variant={result.success ? "default" : "destructive"}
                                className={result.success ? "bg-green-600" : "bg-red-600"}
                              >
                                {result.success ? "✓" : "✗"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={startEmailGeneration}
                      disabled={isEmailGenerating || !selectedSheet || customerData.length === 0}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600"
                    >
                      {isEmailGenerating ? (
                        <>
                          <Pause className="mr-2 h-4 w-4" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Generate Email Drafts
                        </>
                      )}
                    </Button>

                    {customerData.filter(p => !p.research || p.research.trim() === '').length > 0 && (
                      <p className="text-sm text-yellow-400">
                        Complete the research phase first for all profiles to generate email drafts
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="review">
                <Card className="bg-gray-800 border-gray-600">
                  <CardHeader>
                    <CardTitle className="text-white">Review & Send Emails</CardTitle>
                    <CardDescription className="text-gray-400">
                      Review and edit email drafts before sending
                    </CardDescription>
                    {profilesWithDrafts.length > 0 && (
                      <Badge variant="secondary" className="bg-gray-700 text-white border-gray-600 mt-6">
                        {currentDraftIndex + 1} of {profilesWithDrafts.length}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {profilesWithDrafts.length > 0 ? (
                      <>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-300">
                              Email to: {profilesWithDrafts[currentDraftIndex]?.email || "Unknown"}
                            </label>
                            <div className="text-xs text-gray-400">
                              {profilesWithDrafts[currentDraftIndex]?.name} at {profilesWithDrafts[currentDraftIndex]?.company}
                            </div>
                          </div>
                          <Textarea
                            value={currentDraftContent}
                            onChange={(e) => setCurrentDraftContent(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white min-h-[200px] mt-2"
                            placeholder="Email content..."
                          />
                        </div>

                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-4">
                            <h3 className="text-lg font-semibold text-white">
                              Draft {currentDraftIndex + 1} of {profilesWithDrafts.length}
                            </h3>
                            {profilesWithDrafts[currentDraftIndex] && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">
                                  {profilesWithDrafts[currentDraftIndex].name}
                                </span>
                                {profilesWithDrafts[currentDraftIndex].sent && (
                                  <Badge 
                                    variant={profilesWithDrafts[currentDraftIndex].sent === 'TRUE' ? 'default' : 'destructive'}
                                    className="bg-gray-700 text-white border-gray-600"
                                  >
                                    {profilesWithDrafts[currentDraftIndex].sent === 'TRUE' ? 'Sent' : 'Failed'}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={previousDraft}
                              disabled={currentDraftIndex === 0}
                              variant="outline"
                              size="sm"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Previous
                            </Button>
                            <Button
                              onClick={nextDraft}
                              disabled={currentDraftIndex === profilesWithDrafts.length - 1}
                              variant="outline"
                              size="sm"
                            >
                              Next
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <Button 
                            onClick={sendEmail} 
                            disabled={isSendingEmail}
                            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600"
                          >
                            {isSendingEmail ? (
                              <>
                                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Send className="mr-2 h-4 w-4" />
                                Send Email
                              </>
                            )}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-400">No email drafts available</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Generate email drafts first to review and send
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
          <SidebarRail />
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}


