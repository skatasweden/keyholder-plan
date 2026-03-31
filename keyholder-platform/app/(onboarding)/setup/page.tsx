'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase/control-plane'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SieUpload } from '@/components/onboarding/sie-upload'
import { KontoplanPicker } from '@/components/onboarding/kontoplan-picker'
import { Loader2, CheckCircle } from 'lucide-react'

type Step = 'company' | 'data' | 'provisioning'

export default function SetupPage() {
  const [step, setStep] = useState<Step>('company')
  const [companyName, setCompanyName] = useState('')
  const [orgNumber, setOrgNumber] = useState('')
  const [sieFile, setSieFile] = useState<File | null>(null)
  const [selectedKontoplan, setSelectedKontoplan] = useState<string | null>(null)
  const [dataMode, setDataMode] = useState<'upload' | 'kontoplan'>('upload')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<{
    status: string
    progress_pct: number
    progress_message: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Poll job progress
  useEffect(() => {
    if (!jobId) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`)
      const job = await res.json()
      setJobStatus(job)
      if (job.status === 'completed') {
        clearInterval(interval)
        setTimeout(() => router.push('/chat'), 1500)
      }
      if (job.status === 'failed') {
        clearInterval(interval)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [jobId, router])

  async function handleProvision() {
    setLoading(true)
    const supabase = createBrowserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Create customer record if needed
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    let customerId: string

    if (existing) {
      customerId = existing.id
      await supabase
        .from('customers')
        .update({ company_name: companyName, org_number: orgNumber })
        .eq('id', customerId)
    } else {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
          auth_user_id: user.id,
          email: user.email!,
          company_name: companyName,
          org_number: orgNumber,
        })
        .select('id')
        .single()
      customerId = newCustomer!.id
    }

    setStep('provisioning')

    // Start provisioning
    const provRes = await fetch('/api/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        companyName,
        orgNumber,
        kontoplan: dataMode === 'kontoplan' ? selectedKontoplan : undefined,
      }),
    })
    const { jobId: provJobId } = await provRes.json()
    setJobId(provJobId)

    // If SIE file, also start import after provisioning completes
    if (dataMode === 'upload' && sieFile) {
      // Wait for provisioning to complete, then import
      const waitForProvision = setInterval(async () => {
        const res = await fetch(`/api/jobs/${provJobId}`)
        const job = await res.json()
        if (job.status === 'completed') {
          clearInterval(waitForProvision)
          const formData = new FormData()
          formData.append('file', sieFile)
          formData.append('customerId', customerId)
          const importRes = await fetch('/api/import', {
            method: 'POST',
            body: formData,
          })
          const { jobId: importJobId } = await importRes.json()
          setJobId(importJobId)
        }
      }, 2000)
    }
  }

  if (step === 'provisioning') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Setting up your workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {jobStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {jobStatus.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    )}
                    <span className="text-sm">{jobStatus.progress_message}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${jobStatus.progress_pct}%` }}
                    />
                  </div>
                  {jobStatus.status === 'failed' && (
                    <p className="text-sm text-red-500">
                      Setup failed. Please try again.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Starting...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Welcome to KEYHOLDER</CardTitle>
          <CardDescription>
            {step === 'company'
              ? 'Tell us about your company'
              : 'How do you want to get started?'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 'company' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company">Company name</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="AB Exempelbolaget"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org">Organization number (optional)</Label>
                <Input
                  id="org"
                  value={orgNumber}
                  onChange={(e) => setOrgNumber(e.target.value)}
                  placeholder="556677-8899"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => setStep('data')}
                disabled={!companyName}
              >
                Continue
              </Button>
            </div>
          )}

          {step === 'data' && (
            <div className="space-y-4">
              <Tabs
                value={dataMode}
                onValueChange={(v) => setDataMode(v as 'upload' | 'kontoplan')}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload SIE4</TabsTrigger>
                  <TabsTrigger value="kontoplan">Standard chart</TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Export a SIE4 file from Fortnox or your accounting software.
                  </p>
                  <SieUpload onFileSelected={setSieFile} />
                </TabsContent>
                <TabsContent value="kontoplan" className="space-y-3">
                  <p className="text-sm text-gray-500">
                    Start with a standard Swedish chart of accounts.
                  </p>
                  <KontoplanPicker
                    selected={selectedKontoplan}
                    onSelect={setSelectedKontoplan}
                  />
                </TabsContent>
              </Tabs>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('company')}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleProvision}
                  disabled={
                    loading ||
                    (dataMode === 'upload' && !sieFile) ||
                    (dataMode === 'kontoplan' && !selectedKontoplan)
                  }
                >
                  {loading ? 'Setting up...' : 'Create workspace'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
