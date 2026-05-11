/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function hashValue(value: string): Promise<string> {
  const encoder = new window.TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new window.Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
