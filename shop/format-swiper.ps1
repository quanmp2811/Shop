$path = 'styles\swiper-bundle.min.css'
$text = [System.IO.File]::ReadAllText($path)
$sb = New-Object System.Text.StringBuilder
$indent = 0
$inSingle = $false
$inDouble = $false
$inUrl = $false
$inComment = $false
$escaped = $false
for ($i = 0; $i -lt $text.Length; $i++) {
    $ch = $text[$i]
    $next = if ($i + 1 -lt $text.Length) { $text[$i + 1] } else { '' }
    if ($inComment) {
        $sb.Append($ch) | Out-Null
        if ($ch -eq '*' -and $next -eq '/') {
            $i++
            $sb.Append($next) | Out-Null
            $inComment = $false
            $sb.Append("`n") | Out-Null
            if ($indent -gt 0) { $sb.Append('  ' * $indent) | Out-Null }
        }
        continue
    }
    if ($inSingle) {
        $sb.Append($ch) | Out-Null
        if (-not $escaped -and $ch -eq "'") { $inSingle = $false }
        $escaped = (-not $escaped -and $ch -eq '\\')
        continue
    }
    if ($inDouble) {
        $sb.Append($ch) | Out-Null
        if (-not $escaped -and $ch -eq '"') { $inDouble = $false }
        $escaped = (-not $escaped -and $ch -eq '\\')
        continue
    }
    if ($inUrl) {
        $sb.Append($ch) | Out-Null
        if ($ch -eq ')') { $inUrl = $false }
        continue
    }
    if ($ch -eq '/' -and $next -eq '*') {
        $sb.Append("`n/*") | Out-Null
        $inComment = $true
        $i++
        continue
    }
    if ($ch -eq "'") {
        $sb.Append($ch) | Out-Null
        $inSingle = $true
        $escaped = $false
        continue
    }
    if ($ch -eq '"') {
        $sb.Append($ch) | Out-Null
        $inDouble = $true
        $escaped = $false
        continue
    }
    if ($i + 4 -le $text.Length -and $text.Substring($i,4).ToLower() -eq 'url(') {
        $sb.Append('url(') | Out-Null
        $inUrl = $true
        $i += 3
        continue
    }
    if ($ch -eq '{') {
        $sb.Append(' {`n') | Out-Null
        $indent++
        $sb.Append('  ' * $indent) | Out-Null
        continue
    }
    if ($ch -eq '}') {
        $sb.Append("`n") | Out-Null
        $indent = [Math]::Max($indent - 1, 0)
        $sb.Append('  ' * $indent) | Out-Null
        $sb.Append('}`n') | Out-Null
        if ($indent -gt 0) { $sb.Append('  ' * $indent) | Out-Null }
        continue
    }
    if ($ch -eq ';') {
        $sb.Append(';`n') | Out-Null
        if ($indent -gt 0) { $sb.Append('  ' * $indent) | Out-Null }
        continue
    }
    if ($ch -eq "`r" -or $ch -eq "`n") {
        continue
    }
    $sb.Append($ch) | Out-Null
}
$lines = $sb.ToString().Split([Environment]::NewLine, [StringSplitOptions]::None)
$clean = New-Object System.Collections.Generic.List[string]
$blank = $false
foreach ($line in $lines) {
    $trim = $line.TrimEnd()
    if ($trim -eq '') {
        if (-not $blank) { $clean.Add('') }
        $blank = $true
    } else {
        $clean.Add($trim)
        $blank = $false
    }
}
[System.IO.File]::WriteAllLines($path, $clean, [System.Text.Encoding]::UTF8)
Write-Output 'Formatted file successfully.'
