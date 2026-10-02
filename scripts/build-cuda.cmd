@echo off
setlocal
for /f "usebackq tokens=*" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSROOT=%%i"
if not defined VSROOT (
  echo ERROR: MSVC x64 not found.
  exit /b 1
)
call "%VSROOT%\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
if not "%ERRORLEVEL%"=="0" exit /b 1
pushd "%~dp0.."
if not defined CUDA_PATH set "CUDA_PATH=%CD%\..\Project #13\.deps\cuda"
if not exist "%CUDA_PATH%\bin\nvcc.exe" (
  echo ERROR: Set CUDA_PATH to the actual toolkit directory.
  exit /b 1
)
if not exist native\build mkdir native\build
"%CUDA_PATH%\bin\nvcc.exe" -O3 -std=c++17 -arch=sm_86 -cudart=static -Xcompiler /EHsc native\sha256.cu -o native\build\crypto_cuda.exe
if not "%ERRORLEVEL%"=="0" exit /b 1
native\build\crypto_cuda.exe info
popd
