$ErrorActionPreference = 'Stop'
$projectRef = 'teccdzetrdjowqemnuuc'
$baseUrl = "https://$projectRef.supabase.co"
$functionUrl = "$baseUrl/functions/v1/teaching-foundation"
$keyRows = (& npx --yes supabase@latest projects api-keys --project-ref $projectRef --output json) | ConvertFrom-Json
$serviceKey = ($keyRows | Where-Object { $_.id -eq 'service_role' }).api_key
$anonKey = ($keyRows | Where-Object { $_.id -eq 'anon' }).api_key
if (-not $serviceKey -or -not $anonKey) { throw 'Required API keys unavailable' }

$adminHeaders = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; 'Content-Type' = 'application/json' }
$anonHeaders = @{ apikey = $anonKey; 'Content-Type' = 'application/json' }
$createdUsers = [System.Collections.Generic.List[string]]::new()
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$password = 'Phase1-Smoke-' + [guid]::NewGuid().ToString('N') + '!'
$results = [ordered]@{}

function New-SmokeUser([string]$label) {
  $body = @{ email = "phase1-smoke-$suffix-$label@example.invalid"; password = $password; email_confirm = $true; user_metadata = @{ full_name = "Phase1 Smoke $label" } } | ConvertTo-Json -Depth 5
  $user = Invoke-RestMethod -Uri "$baseUrl/auth/v1/admin/users" -Method Post -Headers $adminHeaders -Body $body
  $createdUsers.Add($user.id) | Out-Null
  $tokenBody = @{ email = $user.email; password = $password } | ConvertTo-Json
  $token = Invoke-RestMethod -Uri "$baseUrl/auth/v1/token?grant_type=password" -Method Post -Headers $anonHeaders -Body $tokenBody
  $profile = Invoke-RestMethod -Uri "$baseUrl/rest/v1/profiles?user_id=eq.$($user.id)&select=id" -Method Get -Headers $adminHeaders
  if (-not $profile -or -not $profile[0].id) { throw "Profile missing for $label" }
  return @{ user_id = $user.id; profile_id = $profile[0].id; access_token = $token.access_token }
}

function Set-SmokeRole($actor, [string]$role) {
  $body = @{ role_guru = $role; role_locked_at = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
  Invoke-RestMethod -Uri "$baseUrl/rest/v1/profiles?id=eq.$($actor.profile_id)" -Method Patch -Headers ($adminHeaders + @{ Prefer = 'return=minimal' }) -Body $body | Out-Null
}

function New-SmokeClassroom($actor, [string]$name, [string]$jenjang, [string]$mapelKey, [string]$subject, [string]$bidang = '', [string]$program = '') {
  $row = @{ teacher_id = $actor.profile_id; name = $name; jenjang = $jenjang; mapel_key = $mapelKey; subject = $subject }
  if ($bidang) { $row.bidang_keahlian = $bidang }
  if ($program) { $row.program_keahlian = $program }
  $response = Invoke-RestMethod -Uri "$baseUrl/rest/v1/classrooms?select=id" -Method Post -Headers ($adminHeaders + @{ Prefer = 'return=representation' }) -Body ($row | ConvertTo-Json)
  return $response[0].id
}

function Invoke-Foundation($actor, $payload) {
  $headers = @{ apikey = $anonKey; Authorization = "Bearer $($actor.access_token)"; 'Content-Type' = 'application/json' }
  try {
    $body = Invoke-RestMethod -Uri $functionUrl -Method Post -Headers $headers -Body (($payload + @{ action = 'apply_foundation'; confirmed = $true }) | ConvertTo-Json -Depth 8) -ErrorAction Stop
    return @{ status = 200; body = $body }
  } catch {
    $responseStatus = $_.Exception.Response.StatusCode
    if ($null -eq $responseStatus) {
      throw "HTTP transport failure: $($_.Exception.Message)"
    }
    $status = [int]$responseStatus
    $body = if ($_.ErrorDetails.Message) {
      try { $_.ErrorDetails.Message | ConvertFrom-Json } catch { @{ error = 'Non-JSON error response' } }
    } else { $null }
    return @{ status = $status; body = $body }
  }
}

function Assert-Status([string]$label, $result, [int[]]$expected) {
  if ($expected -notcontains $result.status) { throw "$label expected $($expected -join '/') but got $($result.status): $($result.body | ConvertTo-Json -Compress)" }
  $script:results[$label] = $result.status
}

function With-Overrides($source, $overrides) {
  $copy = $source.Clone()
  foreach ($key in $overrides.Keys) { $copy[$key] = $overrides[$key] }
  return $copy
}

try {
  $mapel = New-SmokeUser 'mapel'
  $other = New-SmokeUser 'other'
  $unlocked = New-SmokeUser 'unlocked'
  $productive = New-SmokeUser 'productive'
  Set-SmokeRole $mapel 'GURU_MAPEL_SDSMP_SMA'
  Set-SmokeRole $other 'GURU_MAPEL_SDSMP_SMA'
  Set-SmokeRole $productive 'GURU_MAPEL_PRODUKTIF_SMK'

  $mapelClass = New-SmokeClassroom $mapel 'Phase1 Mapel Smoke' 'SMP' 'matematika' 'Matematika'
  $otherClass = New-SmokeClassroom $other 'Phase1 Other Smoke' 'SMP' 'matematika' 'Matematika'
  $productiveKey = 'dasar_dasar_teknik_perawatan_gedung'
  $productiveBidang = 'Teknologi Konstruksi dan Properti'
  $productiveProgram = 'Teknik Perawatan Gedung'
  $productiveClass = New-SmokeClassroom $productive 'Phase1 Productive Smoke' 'SMK' $productiveKey 'Dasar-dasar Teknik Perawatan Gedung' $productiveBidang $productiveProgram

  $basePayload = @{ jenjang='SMP'; phase_key='fase_d'; subject_keys=@('matematika'); selected_subject_key='matematika'; element_refs=@(); classroom_id=$mapelClass }
  Assert-Status 'invalid_subject' (Invoke-Foundation $mapel (With-Overrides $basePayload @{ subject_keys=@('subject_tidak_ada'); selected_subject_key='subject_tidak_ada' })) @(400)
  Assert-Status 'invalid_phase' (Invoke-Foundation $mapel (With-Overrides $basePayload @{ phase_key='fase_z' })) @(400)
  Assert-Status 'invalid_element' (Invoke-Foundation $mapel (With-Overrides $basePayload @{ element_refs=@(@{subject_key='matematika';phase_key='fase_d';element_name='Elemen Tidak Ada';cp_dataset_revision='fbf8d8e6218e9cd785e4523c5ec62e2846fcd81098235dcef6561b150ab411af'}) })) @(400)
  Assert-Status 'unlocked_role' (Invoke-Foundation $unlocked $basePayload) @(403)
  Assert-Status 'other_teacher_classroom' (Invoke-Foundation $mapel (With-Overrides $basePayload @{ classroom_id=$otherClass })) @(403)
  $productivePayload = @{ jenjang='SMK';phase_key='fase_e';subject_keys=@($productiveKey);selected_subject_key=$productiveKey;bidang=$productiveBidang;program_keahlian='Program Tidak Valid';element_refs=@();classroom_id=$productiveClass }
  Assert-Status 'invalid_productive_program' (Invoke-Foundation $productive $productivePayload) @(400)
  Assert-Status 'valid_declaration' (Invoke-Foundation $mapel $basePayload) @(200)
  Assert-Status 'valid_scope_reuse' (Invoke-Foundation $mapel $basePayload) @(200)
  Assert-Status 'locked_scope_conflict' (Invoke-Foundation $mapel (With-Overrides $basePayload @{ subject_keys=@('bahasa_indonesia');selected_subject_key='bahasa_indonesia' })) @(403,409)

  $leakCheck = Invoke-Foundation $mapel (With-Overrides $basePayload @{ subject_keys=@('subject_tidak_ada');selected_subject_key='subject_tidak_ada' })
  if (($leakCheck.body | ConvertTo-Json -Compress) -match 'CONTEXT:|PL/pgSQL|SQLSTATE|permission denied for') { throw 'Internal database details leaked' }
  $results['internal_error_leak'] = 'NONE'
  [pscustomobject]$results | ConvertTo-Json
}
finally {
  foreach ($userId in $createdUsers) {
    try { Invoke-RestMethod -Uri "$baseUrl/auth/v1/admin/users/$userId" -Method Delete -Headers $adminHeaders | Out-Null } catch { Write-Warning "Cleanup failed for temporary user id $userId" }
  }
}
