// Unified Desktop Keyboard + Mobile Virtual Joystick Input Manager

export class InputManager {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.keys = new Set();
    this.joyVec = { x: 0, z: 0 };
    this.sprint = false;

    this._bindKeyboard();
    this._bindJoystick();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
        e.preventDefault();
      }
      this.keys.add(code);
      if (code === 'ShiftLeft' || code === 'ShiftRight') this.sprint = true;

      if (!e.repeat) {
        if (code === 'Space' || code === 'KeyE' || code === 'Enter') {
          this.callbacks.onInteract?.();
        } else if (code === 'KeyC') {
          this.callbacks.onCameraCycle?.();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false;
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.sprint = false;
      this.joyVec.x = 0;
      this.joyVec.z = 0;
    });
  }

  _bindJoystick() {
    const base = document.getElementById('joyBase');
    const knob = document.getElementById('joyKnob');
    const actionBtn = document.getElementById('mobileActionBtn');
    if (actionBtn) {
      actionBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.callbacks.onInteract?.();
      });
    }
    if (!base || !knob) return;

    let activeId = null;
    const maxR = 38;

    const updateStick = (clientX, clientY) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > maxR) {
        dx = (dx / len) * maxR;
        dy = (dy / len) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joyVec.x = len > 6 ? dx / maxR : 0;
      this.joyVec.z = len > 6 ? dy / maxR : 0;
    };

    const resetStick = () => {
      activeId = null;
      knob.style.transform = 'translate(0px, 0px)';
      this.joyVec.x = 0;
      this.joyVec.z = 0;
    };

    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      activeId = e.pointerId;
      base.setPointerCapture(e.pointerId);
      updateStick(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activeId) return;
      updateStick(e.clientX, e.clientY);
    });
    base.addEventListener('pointerup', (e) => {
      if (e.pointerId === activeId) resetStick();
    });
    base.addEventListener('pointercancel', resetStick);
  }

  getMoveVector() {
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;

    if (Math.abs(this.joyVec.x) > 0.05 || Math.abs(this.joyVec.z) > 0.05) {
      x = this.joyVec.x;
      z = this.joyVec.z;
    }

    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z, mag: Math.min(1, len), sprint: this.sprint || len > 0.92 };
  }
}
