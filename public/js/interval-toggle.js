class IntervalSwitch extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.initLogic();
  }

  initLogic() {
    const checkbox = this.shadowRoot.getElementById('toggle-checkbox');
    const labelText15m = this.shadowRoot.querySelector('.label-15m');
    const labelText1h = this.shadowRoot.querySelector('.label-1h');

    checkbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      
      // Update global state
      if (window.setUniversalInterval) {
        // Unchecked = 15m, Checked = 1h
        const interval = isChecked ? '1h' : '15m';
        window.setUniversalInterval(interval);
        
        // Update dashboard text display if it exists
        const display = document.getElementById('current-interval-display');
        if(display) display.innerText = isChecked ? '1 hour' : '15 min';
      }

      // Update label styles for visual feedback
      if (isChecked) {
        labelText15m.classList.remove('active');
        labelText1h.classList.add('active');
      } else {
        labelText15m.classList.add('active');
        labelText1h.classList.remove('active');
      }
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }

        /* Container for the whole component including labels */
        .wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* Side Labels (optional, can remove if you want only the switch) */
        .side-label {
          font-size: 13px;
          font-weight: 600;
          color: #94a3b8; /* slate-400 */
          transition: color 0.3s ease;
          cursor: pointer;
        }
        
        .side-label.active {
          color: #3b82f6; /* blue-500 */
        }

        /* The Switch Container */
        .switch {
          position: relative;
          display: inline-block;
          width: 64px;
          height: 32px;
        }

        /* Hide default checkbox */
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        /* The Slider (Background) */
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #e2e8f0; /* slate-200 */
          transition: .4s;
          border-radius: 34px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.06); /* Inner shadow for depth */
          border: 1px solid #cbd5e1;
        }

        /* The Knob (Circle) */
        .slider:before {
          position: absolute;
          content: "";
          height: 24px;
          width: 24px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .4s cubic-bezier(0.4, 0.0, 0.2, 1); /* Bouncy effect */
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.15); /* Drop shadow for pop */
        }

        /* Checked State (1H) */
        input:checked + .slider {
          background-color: #3b82f6; /* Blue-500 */
          border-color: #2563eb;
        }

        input:checked + .slider:before {
          transform: translateX(32px);
        }

        /* Focus states for accessibility */
        input:focus + .slider {
          box-shadow: 0 0 1px #3b82f6;
        }

        /* Icon styling inside the knob (Optional, removed for cleaner look) */
      </style>

      <div class="wrapper">
        <span class="side-label label-15m active">15m</span>
        
        <label class="switch">
          <input type="checkbox" id="toggle-checkbox">
          <span class="slider"></span>
        </label>
        
        <span class="side-label label-1h">1H</span>
      </div>
    `;
  }
}

customElements.define('interval-toggle', IntervalSwitch);