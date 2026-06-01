import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import {
  animations,
  initPort,
  listAnimations,
  playAnimation,
} from './animations';

let stopTimeout: NodeJS.Timeout | null = null;
interface RobotCommand {
  commandType: number;
  targetId: number;
  value: number;
  duration: number;
}

// --- UPDATED PORT CONFIGURATION ---
const port = new SerialPort({
  path: '/dev/ttyACM0', // Check your path. This is now the FTDI adapter!
  baudRate: 9600, // CRITICAL: Must match HC-12 baud rate (default 9600)
  autoOpen: true, // We can autoOpen now because we removed the DTR/RTS hack
});

// We keep the parser in case you eventually program the ESP32 to send telemetry back
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
let limb = 4;

parser.on('data', (line: string) => {
  console.log(`\r[Wall-E]: ${line.trim()}`);
});

port.on('error', (err) => {
  console.error('\n[JoJo]: Serial Port Error: ', err.message);
});

port.on('open', () => {
  initPort(port); // Initialize animation system
  console.log('\n[JoJo]: Transmitting via HC-12 Radio!');
  console.log('=================================');
  console.log('🤖 LIVE CONTROLS ACTIVE 🤖');
  console.log(' [w/s] = Arm Rotator (Servo 0)');
  console.log(' [a/d] = Arm Gear (Servo 1)');
  console.log(' [→/←] = Motor Forward/Reverse');
  console.log(' [↑/↓] = Increase/Decrease Speed');
  console.log(' [p]   = Play animation');
  console.log(' [x]   = EMERGENCY STOP');
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

function resetStopTimer(timerId: number, servoId: number) {
  if (stopTimers[timerId]) clearTimeout(stopTimers[timerId]);

  stopTimers[timerId] = setTimeout(() => {
    console.log(`\r[JoJo]: 🛑 Auto-stopping Servo ${servoId}`);

    activeDirections[timerId] = 0;
    sendToRobot({ commandType: 2, targetId: servoId, value: 0, duration: 0 });

    delete stopTimers[timerId];
  }, 150);
}

function resetMotorStopTimer() {
  if (motorStopTimer) clearTimeout(motorStopTimer);

  motorStopTimer = setTimeout(() => {
    console.log('\r[JoJo]: 🛑 Motor Stopped');
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
      console.log(`\r[JoJo]: 🟢 Starting Servo ${limb} Forward`);
      activeDirections[0] = 1;
      sendToRobot({ commandType: 2, targetId: limb, value: 1, duration: 0 });
    }
    resetStopTimer(0, limb);
  } else if (k === 's') {
    if (activeDirections[0] !== 2) {
      console.log(`\r[JoJo]: 🟢 Starting Servo ${limb} Backward`);
      activeDirections[0] = 2;
      sendToRobot({ commandType: 2, targetId: limb, value: 2, duration: 0 });
    }
    resetStopTimer(0, limb);
  } else if (k === 'a') {
    // --- SERVO 1 CONTROLS (Right Track) ---
    if (activeDirections[1] !== 1) {
      console.log(`\r[JoJo]: 🟢 Starting Servo ${limb + 1} Forward`);
      activeDirections[1] = 1;
      sendToRobot({
        commandType: 2,
        targetId: limb + 1,
        value: 1,
        duration: 0,
      });
    }
    resetStopTimer(1, limb + 1);
  } else if (k === 'd') {
    if (activeDirections[1] !== 2) {
      console.log(`\r[JoJo]: 🟢 Starting Servo ${limb + 1} Backward`);
      activeDirections[1] = 2;
      sendToRobot({
        commandType: 2,
        targetId: limb + 1,
        value: 2,
        duration: 0,
      });
    }
    resetStopTimer(1, limb + 1);
  } else if (k === 'p') {
    // --- PLAY ANIMATION ---
    const animList = Object.entries(animations);
    console.log('\n╔═══════════════════════════════════╗');
    console.log('║      SELECT ANIMATION             ║');
    console.log('╠═══════════════════════════════════╣');
    animList.forEach((entry, i) => {
      console.log(`║ [${i}] ${entry[0].padEnd(28)} ║`);
    });
    console.log('╚═══════════════════════════════════╝');
    console.log(
      'Press animation number (0-' + (animList.length - 1) + ')...\n',
    );

    // Wait for single key press
    const originalHandler = process.stdin.listeners('data')[0];
    process.stdin.removeListener('data', originalHandler as any);

    process.stdin.once('data', (key: Buffer) => {
      const num = parseInt(key.toString());
      if (!isNaN(num) && num >= 0 && num < animList.length) {
        const selectedAnim = animList[num][1];
        console.log(`\n▶️  Selected: ${selectedAnim.name}\n`);
        playAnimation(selectedAnim);
      } else {
        console.log(`❌ Invalid selection\n`);
      }
      // Re-attach original handler
      process.stdin.on('data', originalHandler as any);
    });
  } else if (k === 'x') {
    // --- EMERGENCY STOP ---
    console.log('\r[JoJo]: 🛑 EMERGENCY STOP');
    activeDirections[0] = 0;
    activeDirections[1] = 0;
    motorDirection = 0;
    if (motorStopTimer) clearTimeout(motorStopTimer);
    sendToRobot({ commandType: 255, targetId: 0, value: 0, duration: 0 });
  } else if (key === '\x1b[C') {
    // Right arrow = Forward
    console.log(`\r[JoJo]: 🟢 Motor Forward (Speed: ${motorSpeed})`);
    motorDirection = 1;
    sendToRobot({
      commandType: 4,
      targetId: 0,
      value: motorSpeed,
      duration: 0,
    });
    resetMotorStopTimer();
  } else if (key === '\x1b[D') {
    // Left arrow = Reverse
    console.log(`\r[JoJo]: 🟢 Motor Reverse (Speed: ${motorSpeed})`);
    motorDirection = 2;
    sendToRobot({
      commandType: 4,
      targetId: 1,
      value: motorSpeed,
      duration: 0,
    });
    resetMotorStopTimer();
  } else if (key === '\x1b[A') {
    // Up arrow = Increase speed
    motorSpeed = Math.min(255, motorSpeed + 25);
    console.log(`\r[JoJo]: 📈 Motor Speed: ${motorSpeed}/255`);
    if (motorDirection === 1) {
      sendToRobot({
        commandType: 4,
        targetId: 0,
        value: motorSpeed,
        duration: 0,
      });
    } else if (motorDirection === 2) {
      sendToRobot({
        commandType: 4,
        targetId: 1,
        value: motorSpeed,
        duration: 0,
      });
    }
  } else if (key === '\x1b[B') {
    // Down arrow = Decrease speed
    motorSpeed = Math.max(0, motorSpeed - 25);
    console.log(`\r[JoJo]: 📉 Motor Speed: ${motorSpeed}/255`);
    if (motorSpeed === 0) {
      motorDirection = 0;
      sendToRobot({ commandType: 4, targetId: 2, value: 0, duration: 0 });
    } else if (motorDirection === 1) {
      sendToRobot({
        commandType: 4,
        targetId: 0,
        value: motorSpeed,
        duration: 0,
      });
    } else if (motorDirection === 2) {
      sendToRobot({
        commandType: 4,
        targetId: 1,
        value: motorSpeed,
        duration: 0,
      });
    }
  }
});

export function sendToRobot(cmd: RobotCommand) {
  const buf = Buffer.alloc(7); // Increased from 6 to 7 bytes

  buf.writeUInt8(0xa5, 0); // MAGIC START BYTE: 0xA5 (165 in decimal)
  buf.writeUInt8(cmd.commandType, 1);
  buf.writeUInt8(cmd.targetId, 2);
  buf.writeUInt16LE(cmd.value, 3);
  buf.writeUInt16LE(cmd.duration, 5);

  port.write(buf, (err) => {
    if (err) {
      console.error('\r[JoJo]: Serial write failed:', err.message);
    }
  });
}
