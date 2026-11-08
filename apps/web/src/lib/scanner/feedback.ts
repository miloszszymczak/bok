/** Short beep + haptic tick. AudioContext must be unlocked by a user gesture first. */
let audio: AudioContext | null = null;

export function unlockAudio() {
	try {
		audio ??= new AudioContext();
		if (audio.state === 'suspended') void audio.resume();
	} catch {
		audio = null;
	}
}

export function beep(kind: 'ok' | 'warn' = 'ok') {
	try {
		navigator.vibrate?.(kind === 'ok' ? 35 : [30, 60, 30]);
	} catch {
		/* not supported (iOS) */
	}
	if (!audio || audio.state !== 'running') return;
	const t = audio.currentTime;
	const osc = audio.createOscillator();
	const gain = audio.createGain();
	osc.type = 'sine';
	osc.frequency.value = kind === 'ok' ? 1760 : 440;
	gain.gain.setValueAtTime(0.0001, t);
	gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'ok' ? 0.08 : 0.22));
	osc.connect(gain).connect(audio.destination);
	osc.start(t);
	osc.stop(t + 0.25);
}
