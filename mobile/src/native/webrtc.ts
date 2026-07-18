import { Platform } from 'react-native';

export type WebRTCConnection = {
  close: () => void;
  createOffer: (options?: RTCOfferOptions) => Promise<RTCSessionDescriptionInit>;
  createAnswer: (options?: RTCAnswerOptions) => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (desc: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (desc: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  addTrack: (track: MediaStreamTrack, stream: MediaStream) => void;
  onicecandidate: ((event: { candidate?: RTCIceCandidateInit | null }) => void) | null;
  ontrack: ((event: { streams: MediaStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  connectionState: string;
};

export type WebRTCMediaStream = {
  getTracks: () => MediaStreamTrack[];
  getAudioTracks: () => MediaStreamTrack[];
  getVideoTracks: () => MediaStreamTrack[];
};

export type WebRTCMediaDevices = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

export type WebRTCVideoViewProps = {
  stream: MediaStream | null;
  muted: boolean;
  mirror?: boolean;
  style?: Record<string, unknown>;
};

let platformRTCPeerConnection: (new (config?: RTCConfiguration) => RTCPeerConnection) | null = null;
let platformMediaDevices: WebRTCMediaDevices | null = null;
let platformRTCView: React.ComponentType<WebRTCVideoViewProps> | null = null;

if (Platform.OS === 'web') {
  platformRTCPeerConnection = (globalThis as any).RTCPeerConnection || null;
  const nav = (globalThis as any).navigator;
  platformMediaDevices = nav?.mediaDevices ? { getUserMedia: (c: MediaStreamConstraints) => nav.mediaDevices.getUserMedia(c) } : null;
} else {
  try {
    const rnwebrtc = require('react-native-webrtc');
    platformRTCPeerConnection = rnwebrtc.RTCPeerConnection || null;
    if (rnwebrtc.mediaDevices) {
      platformMediaDevices = { getUserMedia: (c: MediaStreamConstraints) => rnwebrtc.mediaDevices.getUserMedia(c) };
    }
    if (rnwebrtc.RTCView) {
      platformRTCView = rnwebrtc.RTCView;
    }
  } catch {
    platformRTCPeerConnection = null;
    platformMediaDevices = null;
  }
}

export const RTCPeerConnection: (new (config?: RTCConfiguration) => RTCPeerConnection) | null = platformRTCPeerConnection;
export const mediaDevices: WebRTCMediaDevices | null = platformMediaDevices;
export const RTCViewComponent: React.ComponentType<WebRTCVideoViewProps> | null = platformRTCView;

export function isWebRTCAvailable(): boolean {
  return RTCPeerConnection !== null && mediaDevices !== null;
}
