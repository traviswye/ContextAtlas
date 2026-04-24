//go:build !windows

package kinds

const platformName = "other"

func platformGreeting() string {
	return "hello from non-windows"
}
