import React from 'react';
import {
  View,
  StatusBar,
  StyleSheet,
  Platform,
} from 'react-native';

const CustomStatusBar = ({
  backgroundColor = '#F7F7F8',
  barStyle = 'dark-content',
  hidden = false,
  translucent = false,
}) => {
  return (
    <>
      <StatusBar
        backgroundColor={backgroundColor}
        barStyle={barStyle}
        hidden={hidden}
        translucent={translucent}
      />

      {Platform.OS === 'android' && translucent ? (
        <View
          style={[
            styles.androidStatusBar,
            {
              backgroundColor,
              height: StatusBar.currentHeight || 24,
            },
          ]}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  androidStatusBar: {
    width: '100%',
  },
});

export default CustomStatusBar;