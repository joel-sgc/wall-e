import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

let stopTimeout: NodeJS.Timeout | null = null;
interface RobotCommand {
  commandType: number;
  targetId: number;
  value: number;
  duration: number;
}

// --- UPDATED PORT CONFIGURATION ---
const port = new SerialPort({
  path: '/dev/ttyUSB0', // Check your path. This is now the FTDI adapter!
  baudRate: 9600, // CRITICAL: Must match the HC-12 default baud rate
  autoOpen: true, // We can autoOpen now because we removed the DTR/RTS hack
});

// We keep the parser in case you eventually program the ESP32 to send telemetry back
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

parser.on('data', (line: string) => {
  console.log(`\r[Wall-E]: ${line.trim()}`);
});

port.on('error', (err) => {
  console.error('\n[Pi]: Serial Port Error: ', err.message);
});

port.on('open', () => {
  console.log('\n[Pi]: Transmitting via HC-12 Radio!');
  console.log('=================================');
  console.log('🤖 LIVE CONTROLS ACTIVE 🤖');
  console.log(' [w/s] = Left Track (Servo 0)');
  console.log(' [a/d] = Right Track (Servo 1)');
  console.log(' [→/←] = Motor Forward/Reverse');
  console.log(' [↑/↓] = Increase/Decrease Speed');
  console.log(' [x] = EMERGENCY STOP');
  console.log(' [ctrl+c] = Quit');
  console.log('=================================\n');
});

// Live Console Input
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

const activeDirections: { [id: number]: number } = {};
const stopTimers: { [id: number]: NodeJS.Timeout } = {};
let motorSpeed: number = 255; // Motor speed 0-255 (default full speed)
let motorDirection: number = 0; // 0=stopped, 1=forward, 2=reverse

// Motor control state
let motorStopTimer: NodeJS.Timeout | null = null;

function resetStopTimer(id: number) {
  if (stopTimers[id]) clearTimeout(stopTimers[id]);

  stopTimers[id] = setTimeout(() => {
    console.log(`\r[Pi]: 🛑 Auto-stopping Servo ${id}`);

    activeDirections[id] = 0;
    sendToRobot({ commandType: 2, targetId: id, value: 0, duration: 0 });

    delete stopTimers[id];
  }, 150);
}

function resetMotorStopTimer() {
  if (motorStopTimer) clearTimeout(motorStopTimer);

  motorStopTimer = setTimeout(() => {
    console.log('\r[Pi]: 🛑 Motor Stopped');
    motorDirection = 0;
    sendToRobot({ commandType: 4, targetId: 2, value: 0, duration: 0 });
    motorStopTimer = null;
  }, 50);
}

process.stdin.on('data', (key: string) => {
  if (key === '\u0003') process.exit(); // Ctrl+C

  const k = key.toLowerCase();

  // --- SERVO 0 CONTROLS (Left Track) ---
  if (k === 'w') {
    if (activeDirections[0] !== 1) {
      console.log('\r[Pi]: 🟢 Starting Servo 0 Forward');
      activeDirections[0] = 1;
      sendToRobot({ commandType: 2, targetId: 0, value: 1, duration: 0 });
    }
    resetStopTimer(0);
  } else if (k === 's') {
    if (activeDirections[0] !== 2) {
      console.log('\r[Pi]: 🟢 Starting Servo 0 Backward');
      activeDirections[0] = 2;
      sendToRobot({ commandType: 2, targetId: 0, value: 2, duration: 0 });
    }
    resetStopTimer(0);
  }

  // --- SERVO 1 CONTROLS (Right Track) ---
  else if (k === 'a') {
    if (activeDirections[1] !== 1) {
      console.log('\r[Pi]: 🟢 Starting Servo 1 Forward');
      activeDirections[1] = 1;
      // Note: Kept your original logic where 'a' sends value=2 and 'd' sends value=1
      sendToRobot({ commandType: 2, targetId: 1, value: 2, duration: 0 });
    }
    resetStopTimer(1);
  } else if (k === 'd') {
    if (activeDirections[1] !== 2) {
      console.log('\r[Pi]: 🟢 Starting Servo 1 Backward');
      activeDirections[1] = 2;
      sendToRobot({ commandType: 2, targetId: 1, value: 1, duration: 0 });
    }
    resetStopTimer(1);
  }

  // Emergency Stop
  else if (k === 'x') {
    console.log('\r[Pi]: 🛑 EMERGENCY STOP');
    activeDirections[0] = 0;
    activeDirections[1] = 0;
    motorDirection = 0;
    if (motorStopTimer) clearTimeout(motorStopTimer);
    sendToRobot({ commandType: 255, targetId: 0, value: 0, duration: 0 });
  }

  // Motor controls via arrow keys
  // Right arrow = Forward
  else if (key === '\x1b[C') {
    console.log(`\r[Pi]: 🟢 Motor Forward (Speed: ${motorSpeed})`);
    motorDirection = 1;
    sendToRobot({ commandType: 4, targetId: 0, value: motorSpeed, duration: 0 });
    resetMotorStopTimer();
  }
  // Left arrow = Reverse
  else if (key === '\x1b[D') {
    console.log(`\r[Pi]: 🟢 Motor Reverse (Speed: ${motorSpeed})`);
    motorDirection = 2;
    sendToRobot({ commandType: 4, targetId: 1, value: motorSpeed, duration: 0 });
    resetMotorStopTimer();
  }
  // Up arrow = Increase speed
  else if (key === '\x1b[A') {
    motorSpeed = Math.min(255, motorSpeed + 25);
    console.log(`\r[Pi]: 📈 Motor Speed: ${motorSpeed}/255`);
    if (motorDirection === 1) {
      sendToRobot({ commandType: 4, targetId: 0, value: motorSpeed, duration: 0 });
    } else if (motorDirection === 2) {
      sendToRobot({ commandType: 4, targetId: 1, value: motorSpeed, duration: 0 });
    }
  }
  // Down arrow = Decrease speed
  else if (key === '\x1b[B') {
    motorSpeed = Math.max(0, motorSpeed - 25);
    console.log(`\r[Pi]: 📉 Motor Speed: ${motorSpeed}/255`);
    if (motorSpeed === 0) {
      motorDirection = 0;
      sendToRobot({ commandType: 4, targetId: 2, value: 0, duration: 0 });
    } else if (motorDirection === 1) {
      sendToRobot({ commandType: 4, targetId: 0, value: motorSpeed, duration: 0 });
    } else if (motorDirection === 2) {
      sendToRobot({ commandType: 4, targetId: 1, value: motorSpeed, duration: 0 });
    }
  }
});

function sendToRobot(cmd: RobotCommand) {
  const buf = Buffer.alloc(7); // Increased from 6 to 7 bytes

  buf.writeUInt8(0xa5, 0); // MAGIC START BYTE: 0xA5 (165 in decimal)
  buf.writeUInt8(cmd.commandType, 1);
  buf.writeUInt8(cmd.targetId, 2);
  buf.writeUInt16LE(cmd.value, 3);
  buf.writeUInt16LE(cmd.duration, 5);

  port.write(buf, (err) => {
    if (err) {
      console.error('\r[Pi]: Serial write failed:', err.message);
    }
  });
}
