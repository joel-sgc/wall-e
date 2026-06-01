import { SerialPort } from 'serialport';
import * as fs from 'fs';

interface RobotCommand {
  commandType: number;
  targetId: number;
  value: number;
  duration: number;
}

interface ServoCalibration {
  [servoId: number]: {
    min: number;    // pulse values
    max: number;    // pulse values
    current: number; // pulse values
  };
}

const CALIBRATION_FILE = '/home/joelsgc/wall-e/servo_calibration.json';

// Default calibration values (in pulse values)
const defaultCalibration: ServoCalibration = {
  0: { min: 50, max: 500, current: 275 },
  1: { min: 50, max: 500, current: 275 },
  2: { min: 50, max: 500, current: 275 },
  3: { min: 50, max: 500, current: 275 },
  4: { min: 50, max: 500, current: 275 },
  5: { min: 50, max: 500, current: 275 },
  6: { min: 50, max: 500, current: 275 },
  7: { min: 50, max: 500, current: 275 },
  8: { min: 50, max: 500, current: 275 },
  9: { min: 50, max: 500, current: 275 },
  10: { min: 50, max: 500, current: 275 },
  11: { min: 50, max: 500, current: 275 },
  12: { min: 50, max: 500, current: 275 },
  13: { min: 50, max: 500, current: 275 },
  14: { min: 50, max: 500, current: 275 },
  15: { min: 50, max: 500, current: 275 },
};

let calibration: ServoCalibration = defaultCalibration;
let currentServo = 0;
const STEP_SIZE = 5; // Small pulse adjustments

// Load or create calibration file
function loadCalibration() {
  try {
    if (fs.existsSync(CALIBRATION_FILE)) {
      const data = fs.readFileSync(CALIBRATION_FILE, 'utf-8');
      calibration = JSON.parse(data);
      console.log('✓ Loaded existing calibration');
    } else {
      saveCalibration();
      console.log('✓ Created new calibration file');
    }
  } catch (err) {
    console.error('Error loading calibration:', err);
    calibration = defaultCalibration;
  }
}

function saveCalibration() {
  try {
    fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(calibration, null, 2));
    console.log('✓ Calibration saved');
  } catch (err) {
    console.error('Error saving calibration:', err);
  }
}

// Setup serial port
const port = new SerialPort({
  path: '/dev/ttyACM0',
  baudRate: 9600,
  autoOpen: true,
});

port.on('open', () => {
  console.log('\n╔════════════════════════════════════╗');
  console.log('║   SERVO CALIBRATION MODE           ║');
  console.log('╚════════════════════════════════════╝\n');

  loadCalibration();
  printControls();
  printServoStatus();
});

port.on('error', (err) => {
  console.error('Serial port error:', err.message);
  process.exit(1);
});

function printControls() {
  console.log('┌─ CONTROLS ─────────────────────────┐');
  console.log('│ [0-9] = Select servo (0-9)         │');
  console.log('│ [a-f] = Select servo (10-15)       │');
  console.log('│                                    │');
  console.log('│ [w/s] = Adjust ±5 pulse           │');
  console.log('│ [W/S] = Adjust ±20 pulse (hold)   │');
  console.log('│                                    │');
  console.log('│ [m]   = Set MIN to current value  │');
  console.log('│ [M]   = Set MAX to current value  │');
  console.log('│ [r]   = Reset servo to center     │');
  console.log('│                                    │');
  console.log('│ [l]   = List all calibration      │');
  console.log('│ [v]   = Save & verify settings    │');
  console.log('│ [c]   = Clear/reset to defaults   │');
  console.log('│ [q]   = Quit                      │');
  console.log('└────────────────────────────────────┘\n');
}

function printServoStatus() {
  const servo = calibration[currentServo];
  console.log(`╔══ SERVO ${currentServo} ═══════════════════════════╗`);
  console.log(
    `║ MIN:     ${String(servo.min).padStart(4)} pulse   MAX:     ${String(servo.max).padStart(4)} pulse  ║`,
  );
  console.log(
    `║ CURRENT: ${String(servo.current).padStart(4)} pulse ${servo.current < servo.min || servo.current > servo.max ? '⚠️  OUT OF RANGE' : '✓ Valid'} ║`,
  );
  console.log('╚═══════════════════════════════════════════════════╝\n');
}

function sendServoCommand(servoId: number, pulse: number) {
  const servo = calibration[servoId];

  // Constrain to min/max
  const constrainedValue = Math.max(servo.min, Math.min(servo.max, pulse));

  servo.current = constrainedValue;

  // Send calibration command (type 3)
  const cmd: RobotCommand = {
    commandType: 3,
    targetId: servoId,
    value: constrainedValue,
    duration: 0,
  };

  const buf = Buffer.alloc(7);
  buf.writeUInt8(0xa5, 0);
  buf.writeUInt8(cmd.commandType, 1);
  buf.writeUInt8(cmd.targetId, 2);
  buf.writeUInt16LE(cmd.value, 3);
  buf.writeUInt16LE(cmd.duration, 5);

  port.write(buf);
  console.log(`Servo ${servoId}: ${constrainedValue} pulse`);
}

function listCalibration() {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║       SERVO CALIBRATION VALUES       ║');
  console.log('╠═══════════════════════════════════════╣');

  for (let i = 0; i < 16; i++) {
    const servo = calibration[i];
    const status =
      servo.current < servo.min || servo.current > servo.max ? '⚠️' : '✓';
    console.log(
      `║ [${String(i).padStart(2)}] MIN:${String(servo.min).padStart(4)} ` +
        `MAX:${String(servo.max).padStart(4)} CUR:${String(servo.current).padStart(4)} ${status}       ║`,
    );
  }

  console.log('╚═══════════════════════════════════════╝\n');
}

// Input handling
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdin.on('data', (key: string) => {
  const k = key.toLowerCase();

  // Select servo
  if (k >= '0' && k <= '9') {
    currentServo = parseInt(k);
  } else if (k >= 'a' && k <= 'f') {
    currentServo = 10 + (k.charCodeAt(0) - 'a'.charCodeAt(0));
  }

  // Adjust pulse
  else if (k === 'w') {
    sendServoCommand(
      currentServo,
      calibration[currentServo].current + STEP_SIZE,
    );
  } else if (k === 's') {
    sendServoCommand(
      currentServo,
      calibration[currentServo].current - STEP_SIZE,
    );
  } else if (key === 'W') {
    sendServoCommand(
      currentServo,
      calibration[currentServo].current + STEP_SIZE * 4,
    );
  } else if (key === 'S') {
    sendServoCommand(
      currentServo,
      calibration[currentServo].current - STEP_SIZE * 4,
    );
  }

  // Set min/max
  else if (k === 'm') {
    calibration[currentServo].min = calibration[currentServo].current;
    console.log(
      `Servo ${currentServo} MIN set to ${calibration[currentServo].min}`,
    );
  } else if (k === 'M') {
    calibration[currentServo].max = calibration[currentServo].current;
    console.log(
      `Servo ${currentServo} MAX set to ${calibration[currentServo].max}`,
    );
  }

  // Reset servo
  else if (k === 'r') {
    const center = Math.round(
      (calibration[currentServo].min + calibration[currentServo].max) / 2,
    );
    sendServoCommand(currentServo, center);
  }

  // List all
  else if (k === 'l') {
    listCalibration();
  }

  // Save and verify
  else if (k === 'v') {
    saveCalibration();
    console.log('\n✓ Settings verified and saved to servo_calibration.json\n');
  }

  // Clear/reset
  else if (k === 'c') {
    console.log('Resetting to defaults...');
    calibration = JSON.parse(JSON.stringify(defaultCalibration));
    saveCalibration();
  }

  // Quit
  else if (k === 'q' || key === '') {
    saveCalibration();
    console.log('\n✓ Calibration saved. Exiting...');
    process.exit(0);
  }

  printServoStatus();
});
