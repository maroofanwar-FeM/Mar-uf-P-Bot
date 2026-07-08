@echo off
echo Task started at %date% %time% > "C:\Users\maroo\Downloads\P Bot\wrapup-heartbeat.log"
cd /d "C:\Users\maroo\Downloads\P Bot"
echo cd done, PATH is: %PATH% >> "C:\Users\maroo\Downloads\P Bot\wrapup-heartbeat.log"
where claude.cmd >> "C:\Users\maroo\Downloads\P Bot\wrapup-heartbeat.log" 2>&1
call "C:\Users\maroo\AppData\Roaming\npm\claude.cmd" -p "Read CLAUDE.md fresh in this folder, then use the daily-wrapup skill (.claude/skills/daily-wrapup/SKILL.md) to produce today's Daily Wrap-Up for real: gather today's activity from tasks.json and log.md, sort into Done/Doing/Next, write a short plain-language summary, and save it to log/YYYY-MM-DD.md (today's actual date). Follow every safety rule in CLAUDE.md -- never send/delete/publish anything without marking a job needs my OK first, and never fake a result. Append one line to log.md noting the wrap-up ran. Work only within this project folder." --permission-mode acceptEdits < NUL > "C:\Users\maroo\Downloads\P Bot\wrapup-task.log" 2>&1
echo Task finished at %date% %time% >> "C:\Users\maroo\Downloads\P Bot\wrapup-heartbeat.log"
