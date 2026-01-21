/**
 * GnuGo 테스트 스크립트
 * 로컬에서 GnuGo가 제대로 작동하는지 확인합니다.
 */

const { spawn } = require('child_process');
require('dotenv').config();

const gnugoPath = process.env.GNUGO_PATH || 'gnugo';

console.log('=== GnuGo 테스트 ===');
console.log(`GnuGo 경로: ${gnugoPath}`);
console.log(`AI_MODE: ${process.env.AI_MODE || 'not set'}`);
console.log('');

// 간단한 GTP 명령 테스트
const gnugo = spawn(gnugoPath, ['--level', '5', '--mode', 'gtp']);

let output = '';
let errorOutput = '';

gnugo.stdin.write('boardsize 19\n');
gnugo.stdin.write('clear_board\n');
gnugo.stdin.write('play B D4\n');  // 흑이 D4에 착수
gnugo.stdin.write('play W Q16\n'); // 백이 Q16에 착수
gnugo.stdin.write('genmove W\n');  // 백의 다음 수 요청
gnugo.stdin.end();

gnugo.stdout.on('data', (data) => {
    output += data.toString();
});

gnugo.stderr.on('data', (data) => {
    errorOutput += data.toString();
    console.error('GnuGo stderr:', data.toString());
});

let timeoutId;

gnugo.on('close', (code) => {
    clearTimeout(timeoutId);
    
    console.log('=== GnuGo 출력 ===');
    console.log(output);
    
    if (code !== 0) {
        console.error(`\n❌ GnuGo가 종료 코드 ${code}로 종료되었습니다.`);
        if (errorOutput) {
            console.error('에러 출력:', errorOutput);
        }
        process.exit(1);
    }
    
    // GTP 응답 파싱
    const lines = output.split('\n');
    let moveFound = false;
    
    for (const line of lines) {
        const match = line.match(/^=\s*([A-T])(\d+)|^=\s*pass/i);
        if (match) {
            moveFound = true;
            if (match[0].toLowerCase().includes('pass')) {
                console.log('\n✅ GnuGo 테스트 성공! (패스 응답)');
            } else {
                const x = match[1].charCodeAt(0) - 65;
                const y = parseInt(match[2]) - 1;
                const xLetter = match[1];
                console.log(`\n✅ GnuGo 테스트 성공! 백의 다음 수: ${xLetter}${match[2]} (좌표: ${x}, ${y})`);
            }
            break;
        }
    }
    
    if (!moveFound) {
        console.error('\n❌ GnuGo 응답을 파싱할 수 없습니다.');
        console.error('출력:', output);
        process.exit(1);
    }
    
    console.log('\n=== 테스트 완료 ===');
    console.log('이제 서버를 실행하면 GnuGo를 사용할 수 있습니다.');
    console.log('서버 실행: npm run dev');
    process.exit(0);
});

gnugo.on('error', (error) => {
    console.error(`\n❌ GnuGo 실행 실패: ${error.message}`);
    console.error(`경로를 확인하세요: ${gnugoPath}`);
    process.exit(1);
});

// 타임아웃 설정 (10초)
timeoutId = setTimeout(() => {
    gnugo.kill();
    console.error('\n❌ GnuGo 테스트 타임아웃');
    process.exit(1);
}, 10000);

