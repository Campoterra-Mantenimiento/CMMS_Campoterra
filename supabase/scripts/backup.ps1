# Ejecutar desde una terminal propia. No enviar contrasenas ni dumps al chat.
$ErrorActionPreference = 'Stop'
$backupRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'CampoterraRespaldos'
$backupDir = Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$connection = 'postgresql://postgres.ursyrtrsyuvczpwfdlkk@aws-1-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require'
$plainPassword = $null
$secret = $null
try {
    & docker info --format '{{.ServerVersion}}'
    if ($LASTEXITCODE -ne 0) { throw 'Abre Docker Desktop y espera a que arranque.' }
    & npx.cmd --yes supabase@2.120.0 --version
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar Supabase CLI.' }
    # Usar el ejecutable nativo: evita pasar contrasenas por npx.cmd/cmd.exe.
    $npmCache = (& npm.cmd config get cache | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo localizar la cache de npm.' }
    $cli = $null
    foreach ($candidate in Get-ChildItem -LiteralPath (Join-Path $npmCache '_npx') -Filter supabase.exe -Recurse -File) {
        $cliVersion = & $candidate.FullName --version
        if ($LASTEXITCODE -eq 0 -and "$cliVersion".Trim() -eq '2.120.0') { $cli = $candidate.FullName; break }
    }
    if (!$cli) { throw 'No se encontro el ejecutable nativo de Supabase 2.120.0.' }
    Write-Host 'Origen: campoterra-piloto. Este proceso solo exporta; no restaura ni elimina datos.'
    Write-Host 'Durante la exportacion no captures reportes ni modifiques catalogos.'
    $secret = Read-Host 'Contrasena de la BASE DE DATOS (no la de la tablet)' -AsSecureString
    $plainPassword = [System.Net.NetworkCredential]::new('', $secret).Password
    if ([string]::IsNullOrEmpty($plainPassword)) { throw 'La contrasena no puede estar vacia.' }
    # --db-url requiere la contrasena dentro de la URL en esta version del CLI.
    $connection = $connection.Replace('postgres.ursyrtrsyuvczpwfdlkk@',
        ('postgres.ursyrtrsyuvczpwfdlkk:' + [Uri]::EscapeDataString($plainPassword) + '@'))
    New-Item -ItemType Directory -Path $backupDir | Out-Null
    'INCOMPLETO: no usar para recuperacion' | Set-Content (Join-Path $backupDir 'estado.txt')
    $jobs = @(
        @{ Name='roles.sql'; Flags=@('--role-only') },
        @{ Name='schema.sql'; Flags=@() },
        @{ Name='data.sql'; Flags=@('--data-only','--use-copy','-x','storage.buckets_vectors','-x','storage.vector_indexes') }
    )
    foreach ($job in $jobs) {
        $dumpPath = Join-Path $backupDir $job.Name
        $dumpFlags = $job.Flags
        & $cli db dump --db-url $connection --file $dumpPath @dumpFlags
        if ($LASTEXITCODE -ne 0) { throw "Fallo al exportar $($job.Name). El respaldo queda INCOMPLETO." }
        if (!(Test-Path -LiteralPath $dumpPath) -or (Get-Item -LiteralPath $dumpPath).Length -eq 0) {
            throw "Archivo vacio o ausente: $($job.Name)"
        }
    }
    $checksums = foreach ($job in $jobs) {
        $hash = Get-FileHash -LiteralPath (Join-Path $backupDir $job.Name) -Algorithm SHA256
        [pscustomobject]@{ archivo=$job.Name; sha256=$hash.Hash }
    }
    [pscustomobject]@{
        proyecto='ursyrtrsyuvczpwfdlkk'; cli='2.120.0'; fecha_utc=[DateTime]::UtcNow.ToString('o')
        archivos=$checksums; restauracion_probada=$false
    } | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $backupDir 'manifest.json')
    'EXPORTADO: restauracion pendiente de prueba' | Set-Content (Join-Path $backupDir 'estado.txt')
    Write-Host "Exportacion terminada: $backupDir"
    Write-Host 'Conserva estos archivos en privado. Todavia falta probar la restauracion.'
} finally {
    $plainPassword = $null
    $connection = $null
    if ($null -ne $secret) { $secret.Dispose() }
}
