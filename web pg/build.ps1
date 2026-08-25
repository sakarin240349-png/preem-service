$html = Get-Content (Join-Path $PSScriptRoot 'index.html') -Raw -Encoding UTF8
$css = Get-Content (Join-Path $PSScriptRoot 'style.css') -Raw -Encoding UTF8
$lineJs = Get-Content (Join-Path $PSScriptRoot 'line-config.js') -Raw -Encoding UTF8
$appJs = Get-Content (Join-Path $PSScriptRoot 'app.js') -Raw -Encoding UTF8

$styleBlock = "<style>`r`n" + $css + "`r`n</style>"
$lineJsBlock = "<script>`r`n" + $lineJs + "`r`n</script>"
$appJsBlock = "<script>`r`n" + $appJs + "`r`n</script>"

$single = $html.Replace('<link rel="stylesheet" href="style.css">', $styleBlock)
$single = $single.Replace('<script src="line-config.js"></script>', $lineJsBlock)
$single = $single.Replace('<script src="app.js"></script>', $appJsBlock)

$outFile = Join-Path $PSScriptRoot 'single_file_index.html'
[System.IO.File]::WriteAllText($outFile, $single, [System.Text.Encoding]::UTF8)
Write-Host "Build complete: single_file_index.html"
