#include <cuda_runtime.h>
#include <cstdint>
#include <chrono>
#include <iostream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>
#include <stdexcept>
#include <algorithm>

// FIPS 180-4 SHA-256. Every GPU thread evaluates a complete digest.
__constant__ uint32_t constants[64] = {
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
};
__device__ __forceinline__ uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }
__device__ void sha256(const unsigned char* message, int length, uint32_t* digest) {
  uint32_t h[8] = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19};
  const int blocks = (length + 9 + 63) / 64;
  for (int block = 0; block < blocks; block++) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++) {
      uint32_t word = 0;
      for (int j = 0; j < 4; j++) {
        const int pos = block * 64 + i * 4 + j;
        unsigned char byte = pos < length ? message[pos] : (pos == length ? 0x80 : 0);
        if (pos >= blocks * 64 - 8) byte = static_cast<unsigned char>((static_cast<uint64_t>(length) * 8) >> ((blocks * 64 - 1 - pos) * 8));
        word = (word << 8) | byte;
      }
      w[i] = word;
    }
    for (int i = 16; i < 64; i++) {
      uint32_t s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >> 3);
      uint32_t s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >> 10);
      w[i] = w[i-16] + s0 + w[i-7] + s1;
    }
    uint32_t a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for (int i = 0; i < 64; i++) {
      uint32_t t1 = hh + (rotr(e,6)^rotr(e,11)^rotr(e,25)) + ((e&f)^((~e)&g)) + constants[i] + w[i];
      uint32_t t2 = (rotr(a,2)^rotr(a,13)^rotr(a,22)) + ((a&b)^(a&c)^(b&c));
      hh=g;g=f;f=e;e=d+t1;d=c;c=b;b=a;a=t1+t2;
    }
    h[0]+=a;h[1]+=b;h[2]+=c;h[3]+=d;h[4]+=e;h[5]+=f;h[6]+=g;h[7]+=hh;
  }
  for (int i=0;i<8;i++) digest[i]=h[i];
}
__global__ void hashMessage(const unsigned char* bytes, int length, uint32_t* output) { if (threadIdx.x == 0) sha256(bytes, length, output); }
__device__ __constant__ char alphabet[] = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
__global__ void candidates(uint64_t offset, uint32_t count, int length, uint32_t* output) {
  uint32_t i=blockIdx.x*blockDim.x+threadIdx.x;
  if (i>=count) return;
  uint64_t index=offset+i; unsigned char message[256];
  for (int j=length-1;j>=0;j--) {message[j]=alphabet[index%62]; index/=62;}
  uint32_t digest[8]; sha256(message,length,digest);
  // Materialize every full digest: work cannot be eliminated; D2H cost is explicit.
  for (int j=0;j<8;j++) output[i*8+j]=digest[j];
}
void check(cudaError_t status) { if (status!=cudaSuccess) throw std::runtime_error(cudaGetErrorString(status)); }
std::string hex(const uint32_t* words) { std::ostringstream out;out<<std::hex<<std::setfill('0');for(int i=0;i<8;i++)out<<std::setw(8)<<words[i];return out.str(); }
std::string escaped(const std::string& value) { std::string result; for(char c:value){if(c=='"'||c=='\\')result+='\\'; if(c>=32)result+=c;}return result; }
struct Allocation {uint32_t* pointer=nullptr;explicit Allocation(size_t bytes){check(cudaMalloc(&pointer,bytes));}~Allocation(){if(pointer)cudaFree(pointer);}};
struct Event {cudaEvent_t event;Event(){check(cudaEventCreate(&event));}~Event(){cudaEventDestroy(event);}};
std::string hashText(const std::string& text) {
  if(text.size()>256)throw std::runtime_error("Vector too long (max 256 bytes)");
  Allocation bytes(std::max<size_t>(text.size(),1)), digest(32);
  if(!text.empty())check(cudaMemcpy(bytes.pointer,text.data(),text.size(),cudaMemcpyHostToDevice));
  hashMessage<<<1,1>>>(reinterpret_cast<unsigned char*>(bytes.pointer),static_cast<int>(text.size()),digest.pointer);check(cudaGetLastError());
  uint32_t host[8];check(cudaMemcpy(host,digest.pointer,32,cudaMemcpyDeviceToHost));return hex(host);
}
void selftest() {
  if(hashText("")!="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ||
     hashText("abc")!="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" ||
     hashText("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")!="248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1") throw std::runtime_error("GPU SHA-256 self-test failed");
}
uint64_t integer(const char* text) {std::string s(text);if(s.empty()||s.find_first_not_of("0123456789")!=std::string::npos)throw std::runtime_error("Invalid integer");return std::stoull(s);}
int main(int argc,char** argv) {
  try {
    if(argc<2)throw std::runtime_error("Usage: crypto_cuda info | hash HEX | benchmark ITERATIONS LENGTH");
    check(cudaSetDevice(0)); cudaDeviceProp properties{};check(cudaGetDeviceProperties(&properties,0));
    std::string command=argv[1];
    if(command=="hash" && argc==3){std::string input=argv[2],bytes;if(input.size()%2||input.size()>512)throw std::runtime_error("Invalid hex");for(size_t i=0;i<input.size();i+=2){std::string part=input.substr(i,2);if(part.find_first_not_of("0123456789abcdefABCDEF")!=std::string::npos)throw std::runtime_error("Invalid hex");bytes+=static_cast<char>(std::stoul(part,nullptr,16));}std::cout<<"{\"digest\":\""<<hashText(bytes)<<"\"}\n";return 0;}
    selftest();
    if(command=="info" && argc==2){std::cout<<"{\"available\":true,\"device\":\""<<escaped(properties.name)<<"\",\"computeCapability\":\""<<properties.major<<"."<<properties.minor<<"\",\"selftest\":true,\"toolkit\":\""<<CUDART_VERSION<<"\"}\n";return 0;}
    if(command!="benchmark"||argc!=4)throw std::runtime_error("Invalid command");
    uint64_t requested=integer(argv[2]),requestedLength=integer(argv[3]);
    if(requested<100||requested>100000000||requestedLength<1||requestedLength>256)throw std::runtime_error("Workload out of bounds");
    int length=static_cast<int>(requestedLength);
    const uint32_t batchSize=static_cast<uint32_t>(std::min<uint64_t>(requested,262144));
    Allocation output(static_cast<size_t>(batchSize)*32); std::vector<uint32_t> host(batchSize*8);
    for(int i=0;i<3;i++){candidates<<<(batchSize+255)/256,256>>>(0,batchSize,length,output.pointer);check(cudaGetLastError());check(cudaDeviceSynchronize());}
    Event begin,end;double kernel=0;uint64_t done=0;uint32_t checksum=0;std::vector<std::pair<uint64_t,std::string>> samples;
    const auto start=std::chrono::steady_clock::now();
    while(done<requested){
      const uint32_t count=static_cast<uint32_t>(std::min<uint64_t>(batchSize,requested-done));
      check(cudaEventRecord(begin.event));candidates<<<(count+255)/256,256>>>(done,count,length,output.pointer);check(cudaGetLastError());check(cudaEventRecord(end.event));check(cudaEventSynchronize(end.event));
      float ms=0;check(cudaEventElapsedTime(&ms,begin.event,end.event));kernel+=ms/1000.0;
      check(cudaMemcpy(host.data(),output.pointer,static_cast<size_t>(count)*32,cudaMemcpyDeviceToHost));
      for(uint32_t i=0;i<count;i++)checksum^=host[i*8]>>24;
      for(uint64_t index: {uint64_t(0),requested/2,requested-1}) if(index>=done&&index<done+count)samples.emplace_back(index,hex(host.data()+(index-done)*8));
      done+=count;
      if(std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count()>15)break;
    }
    double elapsed=std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count();
    std::cout<<std::setprecision(12)<<"{\"algorithm\":\"SHA-256\",\"backend\":\"GPU CUDA\",\"device\":\""<<escaped(properties.name)<<"\",\"length\":"<<length<<",\"requestedIterations\":"<<requested<<",\"iterations\":"<<done<<",\"elapsed\":"<<elapsed<<",\"rate\":"<<done/elapsed<<",\"kernelElapsed\":"<<kernel<<",\"kernelRate\":"<<done/kernel<<",\"warmup\":"<<3*batchSize<<",\"checksum\":"<<checksum<<",\"selftest\":true,\"capped\":"<<(done<requested?"true":"false")<<",\"digestSamples\":[";
    for(size_t i=0;i<samples.size();i++){if(i)std::cout<<",";std::cout<<"{\"index\":"<<samples[i].first<<",\"digest\":\""<<samples[i].second<<"\"}";}std::cout<<"]}\n";
  }catch(const std::exception& error){std::cerr<<error.what()<<"\n";return 1;}
}
