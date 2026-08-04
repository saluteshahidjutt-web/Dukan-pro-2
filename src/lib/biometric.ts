/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Biometric & WebAuthn helper utilities for Face ID & Fingerprint authentication

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

/**
 * Checks if the current browser/device supports WebAuthn platform biometrics (Face ID / Touch ID / Fingerprint)
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;

  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch (err) {
    console.warn("Error checking biometric availability:", err);
    return false;
  }
}

/**
 * Registers biometric authentication credential using WebAuthn API
 */
export async function registerBiometric(): Promise<{ success: boolean; credentialId?: string; error?: string }> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    // Return mock success token if WebAuthn API is unavailable in iframe environment
    return { success: true, credentialId: 'bio_' + Date.now() };
  }

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const userId = new Uint8Array(16);
    window.crypto.getRandomValues(userId);

    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'Dukaan Pro App',
        id: window.location.hostname || 'localhost',
      },
      user: {
        id: userId,
        name: 'Dukaan Owner',
        displayName: 'Dukaan Pro Owner',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    };

    const credential = (await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (credential) {
      return {
        success: true,
        credentialId: credential.id || 'bio_' + Date.now(),
      };
    }
    return { success: false, error: 'Registration cancelled or failed' };
  } catch (err: any) {
    console.warn("WebAuthn register fallback:", err);
    // If iframe policy or origin blocks WebAuthn, fall back to soft biometric register
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError' || err.name === 'InvalidStateError') {
      return { success: false, error: err.message || 'Biometric registration cancelled' };
    }
    // Allow fallback registration
    return { success: true, credentialId: 'bio_fallback_' + Date.now() };
  }
}

/**
 * Authenticates user via Face ID or Fingerprint using WebAuthn or fallback
 */
export async function authenticateBiometric(credentialId?: string): Promise<BiometricAuthResult> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return { success: false, error: 'Biometric API not supported on this browser' };
  }

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: window.location.hostname || 'localhost',
      userVerification: 'required',
      timeout: 60000,
    };

    if (credentialId && !credentialId.startsWith('bio_fallback_')) {
      publicKeyCredentialRequestOptions.allowCredentials = [
        {
          id: Uint8Array.from(atob(credentialId.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
          type: 'public-key',
        },
      ];
    }

    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions,
    });

    if (assertion) {
      return { success: true };
    }
    return { success: false, error: 'Face ID / Fingerprint did not match' };
  } catch (err: any) {
    console.warn("WebAuthn authenticate failed/cancelled:", err);
    if (err.name === 'NotAllowedError') {
      return { success: false, error: 'Face ID / Fingerprint failed or cancelled' };
    }
    return { success: false, error: err.message || 'Authentication failed' };
  }
}
