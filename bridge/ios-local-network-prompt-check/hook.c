// Loaded into ios-local-network-prompt-check with DYLD_INSERT_LIBRARIES. Prints
// every connection or packet that makes iOS show the Local Network prompt.

#include <arpa/inet.h>
#include <execinfo.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#define INTERPOSE(replacement, original)                                                          \
    __attribute__((used)) static struct {                                                         \
        const void *r;                                                                            \
        const void *o;                                                                            \
    } interpose_##original __attribute__((section("__DATA,__interpose"))) = {(const void *)replacement, \
                                                                           (const void *)original}

static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static unsigned long sendmsg_calls;
static int local_seen;

static int same_prefix(const unsigned char *a, const unsigned char *b, const unsigned char *mask, size_t len) {
    for (size_t i = 0; i < len; i++)
        if ((a[i] & mask[i]) != (b[i] & mask[i])) return 0;
    return 1;
}

static int on_attached_subnet(const struct sockaddr *sa) {
    struct ifaddrs *ifs;
    if (getifaddrs(&ifs) != 0) return 0;
    int found = 0;
    for (struct ifaddrs *i = ifs; i && !found; i = i->ifa_next) {
        if (!i->ifa_addr || !i->ifa_netmask || !(i->ifa_flags & IFF_UP) || (i->ifa_flags & IFF_LOOPBACK)) continue;
        if (i->ifa_addr->sa_family != sa->sa_family) continue;
        if (sa->sa_family == AF_INET)
            found = same_prefix((const unsigned char *)&((const struct sockaddr_in *)sa)->sin_addr,
                                (const unsigned char *)&((const struct sockaddr_in *)i->ifa_addr)->sin_addr,
                                (const unsigned char *)&((const struct sockaddr_in *)i->ifa_netmask)->sin_addr, 4);
        else
            found = same_prefix(((const struct sockaddr_in6 *)sa)->sin6_addr.s6_addr,
                                ((const struct sockaddr_in6 *)i->ifa_addr)->sin6_addr.s6_addr,
                                ((const struct sockaddr_in6 *)i->ifa_netmask)->sin6_addr.s6_addr, 16);
    }
    freeifaddrs(ifs);
    return found;
}

// DNS is skipped because the simulator sends it to the Mac's resolver, which is often the router.
static const char *local_reason(const struct sockaddr *sa, char *dest, size_t dest_len) {
    char ip[INET6_ADDRSTRLEN];
    if (sa->sa_family == AF_INET) {
        const struct sockaddr_in *in = (const struct sockaddr_in *)sa;
        uint32_t a = ntohl(in->sin_addr.s_addr);
        inet_ntop(AF_INET, &in->sin_addr, ip, sizeof ip);
        snprintf(dest, dest_len, "%s:%u", ip, ntohs(in->sin_port));
        if (ntohs(in->sin_port) == 53) return NULL;
        if ((a >> 28) == 0xE) return "multicast";
        if (a == 0xFFFFFFFF) return "broadcast";
        if ((a >> 16) == 0xA9FE) return "link-local";
        return on_attached_subnet(sa) ? "same subnet" : NULL;
    }
    if (sa->sa_family == AF_INET6) {
        const struct sockaddr_in6 *in6 = (const struct sockaddr_in6 *)sa;
        if (IN6_IS_ADDR_V4MAPPED(&in6->sin6_addr)) {
            struct sockaddr_in v4 = {.sin_len = sizeof v4, .sin_family = AF_INET, .sin_port = in6->sin6_port};
            memcpy(&v4.sin_addr, in6->sin6_addr.s6_addr + 12, 4);
            return local_reason((const struct sockaddr *)&v4, dest, dest_len);
        }
        inet_ntop(AF_INET6, &in6->sin6_addr, ip, sizeof ip);
        snprintf(dest, dest_len, "[%s]:%u", ip, ntohs(in6->sin6_port));
        if (ntohs(in6->sin6_port) == 53) return NULL;
        if (IN6_IS_ADDR_MULTICAST(&in6->sin6_addr)) return "multicast";
        if (IN6_IS_ADDR_LINKLOCAL(&in6->sin6_addr)) return "link-local";
        return on_attached_subnet(sa) ? "same subnet" : NULL;
    }
    return NULL;
}

static void check(const char *call, const struct sockaddr *sa) {
    if (!sa) return;
    char dest[80];
    const char *reason = local_reason(sa, dest, sizeof dest);
    if (!reason) return;
    __atomic_store_n(&local_seen, 1, __ATOMIC_RELAXED);
    pthread_mutex_lock(&lock);
    dprintf(STDERR_FILENO, "LOCAL %s %s (%s)\n", call, dest, reason);
    void *frames[48];
    backtrace_symbols_fd(frames, backtrace(frames, 48), STDERR_FILENO);
    pthread_mutex_unlock(&lock);
}

static int hook_connect(int fd, const struct sockaddr *sa, socklen_t len) {
    check("connect", sa);
    return connect(fd, sa, len);
}

static ssize_t hook_sendto(int fd, const void *buf, size_t n, int flags, const struct sockaddr *sa, socklen_t len) {
    check("sendto", sa);
    return sendto(fd, buf, n, flags, sa, len);
}

static ssize_t hook_sendmsg(int fd, const struct msghdr *msg, int flags) {
    __atomic_fetch_add(&sendmsg_calls, 1, __ATOMIC_RELAXED);
    if (msg) check("sendmsg", msg->msg_name);
    return sendmsg(fd, msg, flags);
}

struct msghdr_x {
    void *msg_name;
    socklen_t msg_namelen;
    struct iovec *msg_iov;
    int msg_iovlen;
    void *msg_control;
    socklen_t msg_controllen;
    int msg_flags;
    size_t msg_datalen;
};
extern ssize_t sendmsg_x(int, const struct msghdr_x *, unsigned int, int);

// QUIC sockets find this private batch send with dlsym, and dyld applies interposing to dlsym results.
static ssize_t hook_sendmsg_x(int fd, const struct msghdr_x *msgs, unsigned int n, int flags) {
    __atomic_fetch_add(&sendmsg_calls, 1, __ATOMIC_RELAXED);
    for (unsigned int i = 0; msgs && i < n; i++) check("sendmsg_x", msgs[i].msg_name);
    return sendmsg_x(fd, msgs, n, flags);
}

INTERPOSE(hook_connect, connect);
INTERPOSE(hook_sendto, sendto);
INTERPOSE(hook_sendmsg, sendmsg);
INTERPOSE(hook_sendmsg_x, sendmsg_x);

__attribute__((destructor)) static void verdict(void) {
    if (__atomic_load_n(&local_seen, __ATOMIC_RELAXED)) {
        dprintf(STDERR_FILENO, "error: this build makes iOS ask users for Local Network access. Each LOCAL "
                               "line above shows where the traffic went and the code that sent it.\n");
        _exit(1);
    }
    if (__atomic_load_n(&sendmsg_calls, __ATOMIC_RELAXED) == 0) {
        dprintf(STDERR_FILENO, "error: the check saw none of iroh's traffic, so it cannot tell whether this "
                               "build triggers the prompt\n");
        _exit(1);
    }
}
