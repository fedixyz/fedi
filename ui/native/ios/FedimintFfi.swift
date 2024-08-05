import Fedi

@objc(FedimintFfi)
class FedimintFfi: NSObject {
  @objc
  func initialize(_ options: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
    Task {
        resolve(await fedimintInitialize(eventSink: EventDispatcher(), initOptsJson: String(options)))
    }
  }

  @objc
  func rpc(_ method: NSString, payload: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
    Task {
      resolve(await fedimintRpc(method: String(method), payload: String(payload)))
    }
  }

  @objc
  func getSupportedEvents(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) -> Void {
    resolve(fedimintGetSupportedEvents());
  }
}

@objc(BridgeNativeEventEmitter)
class BridgeNativeEventEmitter: RCTEventEmitter {
  public static var shared: BridgeNativeEventEmitter!

  override init() {
    super.init()
    BridgeNativeEventEmitter.shared = self
  }

  public func send(withEvent eventType: String, body: Any) {
    sendEvent(withName: String(describing: eventType), body: body)
  }

  override func supportedEvents() -> [String] {
    return fedimintGetSupportedEvents()
  }
}

class EventDispatcher: EventSink {
  func event(eventType: String, body: String) {
    BridgeNativeEventEmitter.shared.send(withEvent: eventType, body: body);
  }
}
