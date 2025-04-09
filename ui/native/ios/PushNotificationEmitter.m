#import "PushNotificationEmitter.h"

@implementation PushNotificationEmitter

RCT_EXPORT_MODULE();

+ (id)allocWithZone:(NSZone *)zone {
    static PushNotificationEmitter *sharedInstance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        sharedInstance = [super allocWithZone:zone];
    });
    return sharedInstance;
}

// Send event to JavaScript
+ (void)sendPushNotificationEvent:(NSDictionary *)userInfo {
    [[NSNotificationCenter defaultCenter] postNotificationName:@"PushNotificationTapped"
                                                        object:nil
                                                      userInfo:userInfo];
}

// Supported events
- (NSArray<NSString *> *)supportedEvents {
    return @[@"PushNotificationTapped"];
}

- (void)startObserving {
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handlePushNotification:)
                                                 name:@"PushNotificationTapped"
                                               object:nil];
}

- (void)stopObserving {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

// Handle push notification event
- (void)handlePushNotification:(NSNotification *)notification {
    [self sendEventWithName:@"PushNotificationTapped" body:notification.userInfo];
}

@end
