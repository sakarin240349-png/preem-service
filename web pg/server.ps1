$port = 8080
$endpoint = New-Object System.Net.IPEndPoint ([System.Net.IPAddress]::Loopback, $port)
$listener = New-Object System.Net.Sockets.TcpListener $endpoint
$listener.Start()
Write-Host "HTTP Server listening on http://localhost:$port/"

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader $stream, [System.Text.Encoding]::UTF8
        
        $requestLine = $reader.ReadLine()
        if (-not $requestLine) {
            $client.Close()
            continue
        }
        
        $parts = $requestLine.Split(" ")
        $urlPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }
        
        # Read remaining headers
        while ($line = $reader.ReadLine()) {
            if ([string]::IsNullOrWhiteSpace($line)) { break }
        }
        
        if ($urlPath -eq "/" -or [string]::IsNullOrWhiteSpace($urlPath)) {
            $urlPath = "/index.html"
        }
        
        # Clean path
        $cleanPath = $urlPath.Split("?")[0].TrimStart("/").Replace("/", "\")
        $filePath = Join-Path $PSScriptRoot $cleanPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($bytes, 0, $bytes.Length)
        } else {
            $errBody = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($errBody.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($errBody, 0, $errBody.Length)
        }
        
        $stream.Flush()
        $client.Close()
    }
} finally {
    $listener.Stop()
}
