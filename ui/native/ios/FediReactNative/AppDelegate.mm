#import "AppDelegate.h"

// Push notifications
#import <Firebase.h>
#import <react-native-zendesk-messaging/ZendeskNativeModule.h>
#import <UserNotifications/UserNotifications.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import "RNSplashScreen.h"
#import "PushNotificationEmitter.h"

@interface AppDelegate () <UNUserNotificationCenterDelegate>
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  self.moduleName = @"FediReactNative";
  self.initialProps = @{};

  // Configure Firebase
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
  }

  // Register for remote notifications
  [application registerForRemoteNotifications];
  [UNUserNotificationCenter currentNotificationCenter].delegate = self;

  [super application:application didFinishLaunchingWithOptions:launchOptions];

  // Show splash screen
  [RNSplashScreen show];

  return YES;
}

// Handle APNs token registration and pass it to Firebase and Zendesk
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken {
  [FIRMessaging messaging].APNSToken = deviceToken;
  NSLog(@"APNs Token set in Firebase.");

  [ZendeskNativeModule updatePushNotificationToken:deviceToken];
  NSLog(@"Successfully registered APNs token with Zendesk.");
}

// Handle failed APNs registration
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error {
  NSLog(@"Failed to register for remote notifications: %@", error);
}

// Handle push notifications when app is in foreground
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler {
  NSLog(@"Received push notification while app is in foreground: %@", notification.request.content.userInfo);
  completionHandler(UNNotificationPresentationOptionNone);
}

// Handle when the user taps the push notification
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler
{
    NSDictionary *userInfo = response.notification.request.content.userInfo;
    NSLog(@"🔔 User tapped notification: %@", userInfo);

    // Send event to React Native
    [PushNotificationEmitter sendPushNotificationEvent:userInfo];

    completionHandler();
}

// Provide the JS bundle URL for React Native
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge {
  return [self bundleURL];
}

// Get bundle URL (compatible with RN 0.74.0)
- (NSURL *)bundleURL {
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Handle deep links
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options {
  return [RCTLinkingManager application:application openURL:url options:options];
}

@end
