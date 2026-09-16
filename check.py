import pathlib
p=pathlib.Path(__file__).with_name("game.js")
txt=p.read_text(encoding="utf-8")
in_single=False
in_double=False
in_tick=False
in_block_comment=False
in_line_comment=False
count=0
for i,ch in enumerate(txt):
    if in_line_comment:
        if ch=="\n":
            in_line_comment=False
        continue
    if in_block_comment:
        if ch=="*" and i+1<len(txt) and txt[i+1]=="/":
            in_block_comment=False
        continue
    if not in_single and not in_double and not in_tick:
        if ch=="/" and i+1<len(txt) and txt[i+1]=="/":
            in_line_comment=True
            continue
        if ch=="/" and i+1<len(txt) and txt[i+1]=="*":
            in_block_comment=True
            continue
    if ch=="'" and not in_double and not in_tick:
        if i==0 or txt[i-1]!="\\":
            in_single= not in_single
        continue
    if ch=="\"" and not in_single and not in_tick:
        if i==0 or txt[i-1]!="\\":
            in_double= not in_double
        continue
    if ch=="`" and not in_single and not in_double:
        if i==0 or txt[i-1]!="\\":
            in_tick= not in_tick
        continue
    if in_single or in_double or in_tick:
        continue
    if ch=="{":
        count+=1
    elif ch=="}":
        count-=1
print("final count", count)
