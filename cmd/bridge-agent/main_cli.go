//go:build !wails

package main

import (
	"fmt"
	"os"
)

func main() {
	if err := runCLI(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "bridge-agent:", err)
		os.Exit(1)
	}
}
