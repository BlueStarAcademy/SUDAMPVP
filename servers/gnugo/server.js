const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gnugo' });
});

// Get AI move
app.post('/move', async (req, res) => {
  try {
    const { board, currentPlayer, moveHistory, level = 5 } = req.body;

    if (!board || !currentPlayer) {
      return res.status(400).json({ error: 'board and currentPlayer are required' });
    }

    // GnuGo 난이도 설정 (1-10)
    // level 1 = 약함, level 10 = 강함
    // GnuGo의 --level 옵션 사용 (0-10, 기본값 10)
    // 우리는 1-10을 사용하므로 역변환: gnugoLevel = 11 - level
    const gnugoLevel = Math.max(1, Math.min(10, 11 - level));

    // SGF 형식으로 변환
    const sgf = convertToSGF(board, moveHistory, currentPlayer);

    // GnuGo 실행
    const move = await runGnuGo(sgf, gnugoLevel);

    if (!move) {
      return res.status(500).json({ error: 'Failed to get move from GnuGo' });
    }

    res.json({ move });
  } catch (error) {
    console.error('GnuGo move error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Convert board to SGF format
function convertToSGF(board, moveHistory, currentPlayer) {
  let sgf = '(;FF[4]SZ[19]';
  
  // Add moves
  if (moveHistory && moveHistory.length > 0) {
    for (const move of moveHistory) {
      if (move.x >= 0 && move.y >= 0) {
        const x = String.fromCharCode(97 + move.x);
        const y = String.fromCharCode(97 + move.y);
        const color = move.player === 'black' ? 'B' : 'W';
        sgf += `;${color}[${x}${y}]`;
      }
    }
  }
  
  sgf += ')';
  return sgf;
}

// Run GnuGo and get move
function runGnuGo(sgf, level) {
  return new Promise((resolve, reject) => {
    // GnuGo 명령어 실행
    // --level 옵션으로 난이도 설정
    const gnugo = spawn('gnugo', [
      '--mode', 'gtp',
      '--level', level.toString(),
      '--boardsize', '19'
    ]);

    let output = '';
    let errorOutput = '';

    gnugo.stdout.on('data', (data) => {
      output += data.toString();
    });

    gnugo.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    gnugo.on('close', (code) => {
      if (code !== 0) {
        console.error('GnuGo error:', errorOutput);
        reject(new Error(`GnuGo exited with code ${code}`));
        return;
      }

      // Parse output to get move
      // GnuGo GTP 프로토콜 사용
      const move = parseGnuGoOutput(output);
      resolve(move);
    });

    // Send commands to GnuGo
    gnugo.stdin.write(`loadsgf <(echo '${sgf}')\n`);
    gnugo.stdin.write('genmove B\n');
    gnugo.stdin.write('quit\n');
    gnugo.stdin.end();
  });
}

// Parse GnuGo output
function parseGnuGoOutput(output) {
  // GTP 프로토콜 응답 파싱
  // 예: "= A1" 또는 "= pass"
  const match = output.match(/=\s*([A-T])(\d+)|=\s*pass/i);
  
  if (!match) {
    return null;
  }

  if (match[0].includes('pass')) {
    return { pass: true };
  }

  const x = match[1].charCodeAt(0) - 65; // A=0, B=1, ...
  const y = parseInt(match[2]) - 1; // 1-based to 0-based

  return { x, y, pass: false };
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GnuGo server running on port ${PORT}`);
});

