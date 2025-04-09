
#import <React/RCTEventEmitter.h>

@interface PushNotificationEmitter : RCTEventEmitter
+ (void)sendPushNotificationEvent:(NSDictionary *)userInfo;
@end
