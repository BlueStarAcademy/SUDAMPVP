const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'katago' });
});

// Get hint (suggested move)
app.post('/move', async (req, res) => {
  try {
    const { board, currentPlayer, moveHistory, maxVisits = 30 } = req.body; // CPU용으로 기본값 낮춤

    if (!board || !currentPlayer) {
      return res.status(400).json({ error: 'board and currentPlayer are required' });
    }

    // KataGo 실행 (힌트용, 빠른 계산)
    const move = await runKataGo(board, moveHistory, currentPlayer, maxVisits, false);

    if (!move) {
      return res.status(500).json({ error: 'Failed to get move from KataGo' });
    }

    res.json({ move });
  } catch (error) {
    console.error('KataGo move error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get scoring (계가)
app.post('/score', async (req, res) => {
  try {
    const { board, currentPlayer, moveHistory } = req.body;

    if (!board || !currentPlayer) {
      return res.status(400).json({ error: 'board and currentPlayer are required' });
    }

    // KataGo 계가 실행
    const scoring = await runKataGoScoring(board, moveHistory, currentPlayer);

    if (!scoring) {
      return res.status(500).json({ error: 'Failed to get scoring from KataGo' });
    }

    res.json(scoring);
  } catch (error) {
    console.error('KataGo scoring error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Run KataGo for move/hint (CPU only mode)
function runKataGo(board, moveHistory, currentPlayer, maxVisits, isScoring) {
  return new Promise((resolve, reject) => {
    // KataGo GTP 프로토콜 사용 (CPU 전용)
    // -cpu-only 플래그로 GPU 사용 안 함
    const configPath = process.env.KATAGO_CONFIG_PATH || '/app/config_gtp.cfg';
    const modelPath = process.env.KATAGO_MODEL_PATH || '/katago-models/kata1-b40c256-s11101799168-d2715431527.bin.gz';
    
    const katago = spawn('katago', [
      'gtp',
      '-model', modelPath,
      '-config', configPath,
      '-cpu-only'  // GPU 비활성화, CPU만 사용
    ]);

    let output = '';
    let errorOutput = '';

    katago.stdout.on('data', (data) => {
      output += data.toString();
    });

    katago.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    katago.on('close', (code) => {
      if (code !== 0) {
        console.error('KataGo error:', errorOutput);
        reject(new Error(`KataGo exited with code ${code}`));
        return;
      }

      if (isScoring) {
        const scoring = parseKataGoScoring(output);
        resolve(scoring);
      } else {
        const move = parseKataGoMove(output);
        resolve(move);
      }
    });

    // Send commands
    katago.stdin.write('boardsize 19\n');
    
    // Set up board
    setupBoard(katago, board, moveHistory);
    
    if (isScoring) {
      // 계가: 더 많은 계산 허용 (하지만 CPU이므로 제한적)
      katago.stdin.write(`kata-set-param maxVisits 200\n`);
      katago.stdin.write('final_score\n');
    } else {
      // 힌트: 빠른 응답을 위해 적은 계산
      katago.stdin.write(`time_settings 0 5 1\n`); // 5초 제한
      katago.stdin.write(`kata-set-param maxVisits ${Math.min(maxVisits, 50)}\n`); // CPU이므로 최대 50으로 제한
      katago.stdin.write(`genmove ${currentPlayer === 'black' ? 'B' : 'W'}\n`);
    }
    
    katago.stdin.write('quit\n');
    katago.stdin.end();
  });
}

// Run KataGo for scoring
function runKataGoScoring(board, moveHistory, currentPlayer) {
  return runKataGo(board, moveHistory, currentPlayer, 200, true); // 계가는 더 많은 계산 허용
}

// Setup board in KataGo
function setupBoard(katago, board, moveHistory) {
  // Clear board
  katago.stdin.write('clear_board\n');
  
  // Play moves
  if (moveHistory && moveHistory.length > 0) {
    for (const move of moveHistory) {
      if (move.x >= 0 && move.y >= 0) {
        const x = String.fromCharCode(65 + move.x); // A-T
        const y = (move.y + 1).toString(); // 1-19
        const color = move.player === 'black' ? 'B' : 'W';
        katago.stdin.write(`play ${color} ${x}${y}\n`);
      }
    }
  }
}

// Parse KataGo move output
function parseKataGoMove(output) {
  // GTP 응답 파싱: "= A1" 또는 "= pass"
  const match = output.match(/=\s*([A-T])(\d+)|=\s*pass/i);
  
  if (!match) {
    return null;
  }

  if (match[0].includes('pass')) {
    return { pass: true };
  }

  const x = match[1].charCodeAt(0) - 65;
  const y = parseInt(match[2]) - 1;

  // Win rate와 score lead는 별도 명령으로 가져와야 함
  return { x, y, pass: false, winRate: 0.5, scoreLead: 0 };
}

// Parse KataGo scoring output
function parseKataGoScoring(output) {
  // final_score 응답 파싱: "= W+3.5" 또는 "= B+2"
  const match = output.match(/=\s*([BW])\+([\d.]+)/i);
  
  if (!match) {
    return null;
  }

  const winner = match[1].toUpperCase() === 'B' ? 'black' : 'white';
  const score = parseFloat(match[2]);

  return {
    winner,
    score: winner === 'black' ? score : -score,
    territory: {
      black: winner === 'black' ? 180.5 + score : 180.5 - score,
      white: winner === 'white' ? 180.5 + score : 180.5 - score,
    },
  };
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KataGo server running on port ${PORT}`);
});

