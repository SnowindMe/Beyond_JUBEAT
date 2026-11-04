
Set-Location 'C:\Users\19457\Desktop\Beyond_JUBEAT\'
$env:TEMP='E:\tmp'; $env:TMP='E:\tmp'
$env:NO_PROXY='localhost,127.0.0.1,::1,[::1],*.local'; $env:no_proxy=$env:NO_PROXY
New-Item -ItemType Directory -Force -Path 'E:\tmp' | Out-Null
& cmd /c "npx cf dev > .dev.log 2>&1"
