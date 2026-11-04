# xfade_loop.py in out.wav xfade_ms : bakes a crossfade so the file loops without a click
import sys, subprocess, struct, wave, math
src, dst, ms = sys.argv[1], sys.argv[2], float(sys.argv[3])
raw = subprocess.run(['ffmpeg','-v','error','-i',src,'-ac','2','-ar','44100','-f','s16le','-'],capture_output=True).stdout
n = len(raw)//4; a = list(struct.unpack('<%dh'%(n*2), raw))
X = int(44100*ms/1000)
out = a[2*X:]  # drop head that gets blended into the tail
for i in range(X):
    t = i/X; gin = math.sin(t*math.pi/2); gout = math.cos(t*math.pi/2)
    for c in range(2):
        k = len(out) - 2*X + 2*i + c
        out[k] = max(-32768, min(32767, int(out[k]*gout + a[2*i+c]*gin)))
w = wave.open(dst,'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100)
w.writeframes(struct.pack('<%dh'%len(out), *out)); w.close()
