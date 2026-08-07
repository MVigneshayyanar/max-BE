$files = Get-ChildItem -Path "c:\max BE" -Recurse -Include "*.js" | Where-Object { $_.FullName -notmatch "node_modules|config\\db.js|test-" }

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    
    if ($content -match "new PrismaClient\(\)") {
        Write-Host "Updating: $($file.FullName)"
        
        # Calculate relative path to config/db
        $relativePath = "../config/db"
        if ($file.DirectoryName -eq "c:\max BE") {
            $relativePath = "./config/db"
        }
        
        # Remove PrismaClient import
        $newContent = $content -replace "const\s*\{\s*PrismaClient\s*\}\s*=\s*require\('@prisma/client'\);?\r?\n?", ""
        # Replace new PrismaClient() initialization with require
        $newContent = $newContent -replace "const\s+prisma\s*=\s*new\s+PrismaClient\(\);?", "const prisma = require('$relativePath');"
        
        Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
    }
}
Write-Host "Done updating Prisma instances."
