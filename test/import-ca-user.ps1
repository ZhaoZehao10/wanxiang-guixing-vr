# 把本地生成的 CA 证书安装到「当前用户 → 受信任的根证书」（无需管理员权限）
# 用法：powershell -ExecutionPolicy Bypass -File test\import-ca-user.ps1
$ca = Join-Path $PSScriptRoot '..\cert\ca.crt'
if (-not (Test-Path $ca)) {
  Write-Error "找不到 $ca，请先在仓库根目录运行 node make-cert.mjs"
  exit 1
}
Import-Certificate -FilePath $ca -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
Write-Host "CA 已安装到当前用户受信任根：$ca"
