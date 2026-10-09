# Does this Google key work for address search?
#
# Windows blocks .ps1 files by default (execution policy
# Restricted), so it is invoked through the interpreter rather
# than run directly:
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\check-maps-key.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\check-maps-key.ps1 -Deployed
#
# Bypass applies to this one invocation and changes nothing on
# the machine.
#
# The PowerShell twin of check-maps-key.sh, because Windows opens
# PowerShell by default and a .sh script there fails in a way that
# looks like the key is wrong.
#
# It makes exactly the request `apps/web/app/api/location/search`
# makes — same endpoint, same header, same field mask — because a
# key that works for a different Places call can still be refused
# for this one.
#
# The key is read with -AsSecureString, so it is not echoed and
# does not land in your PowerShell history.

[CmdletBinding()]
param(
    [switch] $Deployed,
    [string] $Site = $(if ($env:NEXG_SITE) { $env:NEXG_SITE } else { 'https://nexg-sepia.vercel.app' })
)

# PowerShell 5.1 still negotiates TLS 1.0 by default on some
# machines, and Google refuses that — which looks exactly like a
# rejected key.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Show-Problem {
    param([int] $Status, [string] $Message)

    Write-Host ""
    switch ($Status) {
        403 {
            Write-Host "REFUSED (403). The three causes, in the order they are usually wrong:" -ForegroundColor Red
            Write-Host ""
            Write-Host "  1. Places API (New) is not enabled on the project."
            Write-Host "     It is a separate entry from the older Places API."
            Write-Host "  2. The key has an Application restriction. It must be None —"
            Write-Host "     this call comes from a server with no referer and no fixed IP."
            Write-Host "  3. The key's API restriction does not include Places API (New)."
        }
        400 {
            # A mistyped key and a wrong-API project both land on
            # 400, and telling somebody to check their API when
            # they pasted half a key wastes the afternoon this
            # script exists to save. Google distinguishes them.
            if ($Message -match 'API key not valid') {
                Write-Host "THE KEY ITSELF IS NOT VALID (400)." -ForegroundColor Red
                Write-Host ""
                Write-Host "Nothing to do with restrictions. Copy it again from"
                Write-Host "Credentials -> your key -> Show key, and watch for a"
                Write-Host "missing character at either end."
            } else {
                Write-Host "BAD REQUEST (400) - usually means the project has the legacy" -ForegroundColor Red
                Write-Host "Places API enabled rather than Places API (New)."
            }
        }
        429 {
            Write-Host "QUOTA (429). The key is valid but the project is over its limit," -ForegroundColor Red
            Write-Host "or billing is not enabled."
        }
        default {
            Write-Host "HTTP $Status" -ForegroundColor Red
        }
    }
    if ($Message) {
        Write-Host ""
        Write-Host "Google said: $Message" -ForegroundColor DarkYellow
    }
}

if ($Deployed) {
    Write-Host "Asking the deployed site to search for an address..."
    Write-Host ""
    try {
        $r = Invoke-RestMethod -Uri "$Site/api/location/search?q=Yaya+Centre" -TimeoutSec 30
    } catch {
        Write-Host "Could not reach $Site" -ForegroundColor Red
        exit 1
    }
    if ($r.reason) {
        Write-Host "NOT WORKING" -ForegroundColor Red
        Write-Host ""
        Write-Host $r.reason
        exit 1
    }
    $n = @($r.results).Count
    Write-Host "WORKING - $n result(s)" -ForegroundColor Green
    if ($n -gt 0) { Write-Host ("  first: " + @($r.results)[0].label) }
    exit 0
}

$secure = Read-Host -Prompt 'Paste the server key (it will not be shown)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($key)) {
    Write-Host "Nothing entered." -ForegroundColor Red
    exit 1
}

# The same call the route makes. A mismatch here is the point of
# the script, so none of it is "close enough".
$body = @{
    textQuery    = 'Yaya Centre Nairobi'
    locationBias = @{
        rectangle = @{
            low  = @{ latitude = -4.8; longitude = 33.9 }
            high = @{ latitude = 1.6; longitude = 41.9 }
        }
    }
    maxResultCount = 3
} | ConvertTo-Json -Depth 6

$headers = @{
    'X-Goog-Api-Key'    = $key
    'X-Goog-FieldMask'  = 'places.displayName,places.formattedAddress,places.location,places.plusCode'
}

Write-Host ""
try {
    $resp = Invoke-RestMethod `
        -Uri 'https://places.googleapis.com/v1/places:searchText' `
        -Method Post -Headers $headers -ContentType 'application/json' `
        -Body $body -TimeoutSec 20

    $key = $null

    $places = @($resp.places)
    if ($places.Count -eq 0) {
        Write-Host "The key works, but Google found nothing for that query." -ForegroundColor Yellow
        Write-Host 'That is unusual for "Yaya Centre Nairobi" — check the project'
        Write-Host "is the one you think it is."
        exit 0
    }

    Write-Host "WORKS. $($places.Count) result(s):" -ForegroundColor Green
    foreach ($p in $places) {
        Write-Host ("  - {0} - {1}" -f $p.displayName.text, $p.formattedAddress)
    }
    Write-Host ""
    Write-Host "Put this key in Vercel as GOOGLE_MAPS_API_KEY"
    Write-Host "(no NEXT_PUBLIC_ prefix — that would publish it)."
    exit 0
} catch {
    $key = $null

    $status = 0
    $detail = ''
    if ($_.Exception.Response) {
        $status = [int] $_.Exception.Response.StatusCode
        try {
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $raw = $reader.ReadToEnd()
            $reader.Close()
            $detail = (ConvertFrom-Json $raw).error.message
        } catch {
            $detail = ''
        }
    }
    Show-Problem -Status $status -Message $detail
    exit 1
}
