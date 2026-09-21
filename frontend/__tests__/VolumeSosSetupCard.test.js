import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {NativeModules, Platform} from 'react-native';
import VolumeSosSetupCard from '../src/components/VolumeSosSetupCard';

const allText = renderer => renderer.root
  .findAll(node => typeof node.type === 'string' && node.type === 'Text')
  .map(node => node.children.join(''))
  .join(' | ');

function findPressable(renderer, label) {
  return renderer.root.findAll(
    node => typeof node.props?.onPress === 'function' && node.props.accessibilityLabel === label,
  )[0];
}

describe('VolumeSosSetupCard', () => {
  const originalOs = Platform.OS;
  const originalModule = NativeModules.SosTrigger;

  afterEach(() => {
    Platform.OS = originalOs;
    NativeModules.SosTrigger = originalModule;
  });

  it('renders nothing when the native module is unavailable', async () => {
    Platform.OS = 'android';
    NativeModules.SosTrigger = undefined;
    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<VolumeSosSetupCard />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it('renders nothing on iOS', async () => {
    Platform.OS = 'ios';
    NativeModules.SosTrigger = {getReadiness: jest.fn()};
    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<VolumeSosSetupCard />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it('asks the user to turn the accessibility service on and opens its settings', async () => {
    Platform.OS = 'android';
    const openAccessibilitySettings = jest.fn();
    NativeModules.SosTrigger = {
      getReadiness: jest.fn().mockResolvedValue({
        accessibilityEnabled: false,
        accessibilityConnected: false,
        notificationsEnabled: true,
        fullScreenIntentAllowed: true,
        batteryUnrestricted: true,
        sdkInt: 34,
        manufacturer: 'google',
      }),
      openAccessibilitySettings,
    };
    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<VolumeSosSetupCard />);
    });
    expect(allText(renderer)).toContain('SETUP NEEDED');
    await act(async () => {
      findPressable(renderer, 'Turn on').props.onPress();
    });
    expect(openAccessibilitySettings).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when every switch is already on', async () => {
    Platform.OS = 'android';
    NativeModules.SosTrigger = {
      getReadiness: jest.fn().mockResolvedValue({
        accessibilityEnabled: true,
        accessibilityConnected: true,
        notificationsEnabled: true,
        fullScreenIntentAllowed: true,
        batteryUnrestricted: true,
        sdkInt: 34,
        manufacturer: 'google',
      }),
    };
    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<VolumeSosSetupCard />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it('lists only the switches that are still off', async () => {
    Platform.OS = 'android';
    NativeModules.SosTrigger = {
      getReadiness: jest.fn().mockResolvedValue({
        accessibilityEnabled: true,
        accessibilityConnected: true,
        notificationsEnabled: false,
        fullScreenIntentAllowed: true,
        batteryUnrestricted: true,
        sdkInt: 34,
        manufacturer: 'google',
      }),
      openNotificationSettings: jest.fn(),
    };
    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<VolumeSosSetupCard />);
    });
    const text = allText(renderer);
    expect(text).toContain('Notifications');
    expect(text).not.toContain('Volume button detection');
    expect(text).not.toContain('Full-screen alerts');
    expect(text).not.toContain('Battery: unrestricted');
  });

  it('ignores the Android 14+ full-screen switch on older Android', async () => {
    Platform.OS = 'android';
    NativeModules.SosTrigger = {
      getReadiness: jest.fn().mockResolvedValue({
        accessibilityEnabled: true,
        accessibilityConnected: true,
        notificationsEnabled: true,
        fullScreenIntentAllowed: false,
        batteryUnrestricted: true,
        sdkInt: 31,
        manufacturer: 'google',
      }),
    };
    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<VolumeSosSetupCard />);
    });
    expect(renderer.toJSON()).toBeNull();
  });
});
