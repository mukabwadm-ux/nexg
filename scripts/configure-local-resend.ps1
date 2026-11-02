param(
  [Parameter(Mandatory = $true)][string]$SupabaseWorkdir,
  [Parameter(Mandatory = $true)][string]$SupabaseCli
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$secretFile = Join-Path $workspace '.env.resend.local'
$configFile = Join-Path $SupabaseWorkdir 'supabase/config.toml'
$backupFile = Join-Path $SupabaseWorkdir 'supabase/config.before-resend.toml'
$template = Join-Path $workspace 'supabase/templates/otp-code.html'
$destination = Join-Path $SupabaseWorkdir 'supabase/templates/otp-code.html'

if (!(Test-Path -LiteralPath $secretFile) -or !(Test-Path -LiteralPath $configFile) -or !(Test-Path -LiteralPath $SupabaseCli)) {
  throw 'The local key, Supabase configuration, or CLI is missing.'
}
$keyLine = Get-Content -LiteralPath $secretFile | Where-Object { $_ -match '^RESEND_API_KEY=' } | Select-Object -First 1
if (!$keyLine) { throw 'Add RESEND_API_KEY to the private local configuration first.' }
$resendKey = $keyLine.Substring('RESEND_API_KEY='.Length).Trim()
if (($resendKey.StartsWith('"') -and $resendKey.EndsWith('"')) -or ($resendKey.StartsWith("'") -and $resendKey.EndsWith("'"))) {
  $resendKey = $resendKey.Substring(1, $resendKey.Length - 2)
}
if ($resendKey -notmatch '^re_\S+$') { throw 'The saved Resend key does not have the expected format.' }

$config = [System.IO.File]::ReadAllText($configFile)
if ($config -notmatch '(?m)^project_id\s*=\s*"nexg-merchant-onboarding-run-20261102"\s*$') {
  throw 'The selected Supabase project is not the current merchant development instance.'
}
if ($config -match '(?m)^\[auth\.email\.smtp\]\s*$') {
  if ($config -notmatch '(?m)^host = "smtp\.resend\.com"\s*$' -or
      $config -notmatch '(?m)^admin_email = "info@nexgapp\.com"\s*$' -or
      $config -notmatch '(?m)^pass = "env\(RESEND_API_KEY\)"\s*$' -or
      $config -notmatch '(?m)^\[auth\.email\.template\.email_change\]\s*$') {
    throw 'Different custom email settings already exist; review them before changing the local service.'
  }
  $oldKey = $env:RESEND_API_KEY
  try {
    $env:RESEND_API_KEY = $resendKey
    & $SupabaseCli start --workdir $SupabaseWorkdir -x 'realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'The configured local Supabase instance could not start.' }
    Write-Output 'Local Supabase is already configured for Resend.'
    return
  } finally {
    $env:RESEND_API_KEY = $oldKey
    $resendKey = $null
  }
}
if ($config -match '(?m)^\[auth\.email\.template\.email_change\]\s*$') {
  throw 'A custom email template already exists; review it before changing the local service.'
}

if (!(Test-Path -LiteralPath $backupFile)) { Copy-Item -LiteralPath $configFile -Destination $backupFile }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
Copy-Item -LiteralPath $template -Destination $destination -Force

$changes = @(
  @{ Pattern = '(?m)^enable_manual_linking\s*=\s*false\s*$'; Replacement = 'enable_manual_linking = true' },
  @{ Pattern = '(?m)^max_frequency\s*=\s*"1s"\s*$'; Replacement = 'max_frequency = "1m"' },
  @{ Pattern = '(?m)^otp_expiry\s*=\s*3600\s*$'; Replacement = 'otp_expiry = 600' },
  @{ Pattern = '(?m)^email_sent\s*=\s*2\s*$'; Replacement = 'email_sent = 30' }
)
foreach ($change in $changes) {
  if ([regex]::Matches($config, $change.Pattern).Count -ne 1) { throw 'The local Auth settings have changed; inspect them before continuing.' }
  $config = [regex]::Replace($config, $change.Pattern, $change.Replacement)
}
$emailStart = $config.IndexOf('[auth.email]')
if ($emailStart -lt 0) { throw 'The email Auth section could not be found.' }
$emailEnd = $config.IndexOf('[auth.sms]', $emailStart)
if ($emailEnd -le $emailStart) { throw 'The email Auth section could not be found.' }
$emailSection = $config.Substring($emailStart, $emailEnd - $emailStart)
$confirmationPattern = '(?m)^enable_confirmations[ \t]*=[ \t]*false[ \t]*\r?$'
if ([regex]::Matches($emailSection, $confirmationPattern).Count -ne 1) { throw 'The email confirmation setting has changed; inspect it before continuing.' }
$emailSection = [regex]::Replace($emailSection, $confirmationPattern, 'enable_confirmations = true')
$config = $config.Substring(0, $emailStart) + $emailSection + $config.Substring($emailEnd)
$config += @'

[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 587
user = "resend"
pass = "env(RESEND_API_KEY)"
admin_email = "info@nexgapp.com"
sender_name = "NexG"

[auth.email.template.email_change]
subject = "Your NexG verification code"
content_path = "./supabase/templates/otp-code.html"

[auth.email.template.magic_link]
subject = "Your NexG sign-in code"
content_path = "./supabase/templates/otp-code.html"
'@
[System.IO.File]::WriteAllText($configFile, $config, [System.Text.UTF8Encoding]::new($false))

$oldKey = $env:RESEND_API_KEY
try {
  $env:RESEND_API_KEY = $resendKey
  & $SupabaseCli stop --workdir $SupabaseWorkdir *> $null
  if ($LASTEXITCODE -ne 0) { throw 'The local Supabase instance could not be stopped safely.' }
  & $SupabaseCli start --workdir $SupabaseWorkdir -x 'realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor' *> $null
  if ($LASTEXITCODE -ne 0) { throw 'The local Supabase instance could not start with the Resend settings.' }
  Write-Output 'Local Supabase Auth restarted with Resend settings. Database volumes were retained.'
} catch {
  $failure = $_
  Copy-Item -LiteralPath $backupFile -Destination $configFile -Force
  & $SupabaseCli stop --workdir $SupabaseWorkdir *> $null
  & $SupabaseCli start --workdir $SupabaseWorkdir -x 'realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor' *> $null
  if ($LASTEXITCODE -ne 0) { throw 'The email configuration failed and the previous local service could not be restarted. Database volumes were retained.' }
  throw $failure
} finally {
  $env:RESEND_API_KEY = $oldKey
  $resendKey = $null
}
