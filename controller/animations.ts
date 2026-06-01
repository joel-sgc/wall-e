import { SerialPort } from 'serialport';
import { sendToRobot } from '.';

interface RobotCommand {
  commandType: number;
  targetId: number;
  value: number;
  duration: number;
}

interface AnimationStep {
  delay: number; // milliseconds before executing this action
  command: RobotCommand;
}

interface Animation {
  name: string;
  steps: AnimationStep[];
}

let port: SerialPort;

// Initialize port
export function initPort(serialPort: SerialPort) {
  port = serialPort;
}

// Play animation
export async function playAnimation(animation: Animation) {
  console.log(`\n▶️  Playing animation: ${animation.name}`);
  console.log(`   ${animation.steps.length} steps\n`);

  for (let i = 0; i < animation.steps.length; i++) {
    const step = animation.steps[i];

    // Wait before executing
    await delay(step.delay);

    // Send command
    sendToRobot(step.command);
    console.log(
      `[${i + 1}/${animation.steps.length}] Type:${step.command.commandType} ` +
        `ID:${step.command.targetId} Val:${step.command.value} (after ${step.delay}ms)`,
    );
  }

  console.log(`\n✓ Animation complete: ${animation.name}\n`);
}

// Helper for delays
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== ANIMATION DEFINITIONS =====

// Servo movement helper (degrees 0-180, Arduino converts to pulse)
function servoMove(
  servoId: number,
  degrees: number,
  delay: number,
): AnimationStep {
  return {
    delay,
    command: {
      commandType: 6, // Servo degree command (Arduino converts to pulse)
      targetId: servoId,
      value: degrees, // Send degrees, Arduino converts to pulse
      duration: 0,
    },
  };
}

// Jog helper (for continuous servo control)
function jogServo(
  servoId: number,
  direction: number,
  delay: number,
): AnimationStep {
  return {
    delay,
    command: {
      commandType: 2, // Jog command
      targetId: servoId,
      value: direction, // 1=forward, 2=backward, 0=stop
      duration: 0,
    },
  };
}

// Motor helper
function motorControl(
  direction: number,
  speed: number,
  delay: number,
): AnimationStep {
  return {
    delay,
    command: {
      commandType: 4, // Motor command
      targetId: direction, // 0=forward, 1=reverse, 2=stop
      value: speed, // 0-255
      duration: 0,
    },
  };
}

// Stop helper
function stop(delay: number): AnimationStep {
  return {
    delay,
    command: {
      commandType: 255, // Emergency stop
      targetId: 0,
      value: 0,
      duration: 0,
    },
  };
}

// ===== EXAMPLE ANIMATIONS =====

export const animations: { [key: string]: Animation } = {
  cal_eyes: {
    name: 'Calibrate Eyes',
    steps: [
      servoMove(4, 0, 0),
      servoMove(5, 180, 0),
      servoMove(4, 180, 500),
      servoMove(5, 0, 500),
      servoMove(4, 0, 500),
      servoMove(5, 180, 500),
      servoMove(4, 180, 500),
      servoMove(5, 0, 0),
      servoMove(4, 0, 500),
      servoMove(5, 180, 0),
      servoMove(4, 90, 500),
      servoMove(5, 90, 0),
    ],
  },
};

// List all animations
export function listAnimations() {
  console.log('\n╔═══════════════════════════════════╗');
  console.log('║      AVAILABLE ANIMATIONS          ║');
  console.log('╠═══════════════════════════════════╣');

  Object.keys(animations).forEach((key) => {
    const anim = animations[key];
    console.log(
      `║ ${key.padEnd(15)} - ${anim.name.padEnd(15)} (${anim.steps.length} steps) ║`,
    );
  });

  console.log('╚═══════════════════════════════════╝\n');
}
