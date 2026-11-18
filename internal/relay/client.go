package relay

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

type Manifest struct {
	ProjectID     string `json:"projectId"`
	SourceNetwork string `json:"sourceNetwork"`
	TargetNetwork string `json:"targetNetwork"`
	SourceRef     string `json:"sourceRef"`
	TargetRef     string `json:"targetRef"`
	HeadSHA       string `json:"headSha"`
	BaseSHA       string `json:"baseSha"`
	BundleSHA256  string `json:"bundleSha256"`
}

type Transfer struct {
	ID            string     `json:"id"`
	ProjectID     string     `json:"projectId"`
	SourceNetwork string     `json:"sourceNetwork"`
	TargetNetwork string     `json:"targetNetwork"`
	SourceRef     string     `json:"sourceRef"`
	TargetRef     string     `json:"targetRef"`
	HeadSHA       string     `json:"headSha"`
	BaseSHA       string     `json:"baseSha"`
	BundleSHA256  string     `json:"bundleSha256"`
	Size          int64      `json:"size"`
	CreatedAt     time.Time  `json:"createdAt"`
	DownloadedAt  *time.Time `json:"downloadedAt,omitempty"`
	ExpiresAt     time.Time  `json:"expiresAt"`
}

type FileManifest struct {
	ProjectID     string `json:"projectId"`
	SourceNetwork string `json:"sourceNetwork"`
	TargetNetwork string `json:"targetNetwork"`
	Filename      string `json:"filename"`
	SHA256        string `json:"sha256"`
}

type FileTransfer struct {
	ID            string     `json:"id"`
	ProjectID     string     `json:"projectId"`
	SourceNetwork string     `json:"sourceNetwork"`
	TargetNetwork string     `json:"targetNetwork"`
	Filename      string     `json:"filename"`
	SHA256        string     `json:"sha256"`
	Size          int64      `json:"size"`
	CreatedAt     time.Time  `json:"createdAt"`
	DownloadedAt  *time.Time `json:"downloadedAt,omitempty"`
	ExpiresAt     time.Time  `json:"expiresAt"`
}

type Client struct {
	baseURL    *url.URL
	httpClient *http.Client
}

func NewClient(baseURL string) (*Client, error) {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("relay URL must be an absolute HTTP(S) URL")
	}
	return &Client{baseURL: parsed, httpClient: &http.Client{Timeout: 0}}, nil
}

func (c *Client) endpoint(parts ...string) string {
	urlCopy := *c.baseURL
	segments := append([]string{urlCopy.Path, "api", "bridge", "v1"}, parts...)
	urlCopy.Path = path.Join(segments...)
	return urlCopy.String()
}

func parseError(response *http.Response) error {
	defer response.Body.Close()
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err == nil && payload.Error != "" {
		return fmt.Errorf("relay returned %s: %s", response.Status, payload.Error)
	}
	return fmt.Errorf("relay returned %s", response.Status)
}

func (c *Client) Upload(ctx context.Context, manifest Manifest, bundlePath string) (Transfer, error) {
	bundle, err := os.Open(bundlePath)
	if err != nil {
		return Transfer{}, err
	}

	reader, writer := io.Pipe()
	multipartWriter := multipart.NewWriter(writer)
	writeDone := make(chan error, 1)
	go func() {
		defer bundle.Close()
		defer close(writeDone)
		if err := multipartWriter.WriteField("manifest", mustJSON(manifest)); err != nil {
			_ = writer.CloseWithError(err)
			writeDone <- err
			return
		}
		part, err := multipartWriter.CreateFormFile("bundle", path.Base(bundlePath))
		if err == nil {
			_, err = io.Copy(part, bundle)
		}
		if closeErr := multipartWriter.Close(); err == nil {
			err = closeErr
		}
		if err != nil {
			_ = writer.CloseWithError(err)
		} else {
			err = writer.Close()
		}
		writeDone <- err
	}()

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint("transfers"), reader)
	if err != nil {
		return Transfer{}, err
	}
	request.Header.Set("Content-Type", multipartWriter.FormDataContentType())
	response, err := c.httpClient.Do(request)
	if err != nil {
		return Transfer{}, err
	}
	if response.StatusCode != http.StatusCreated {
		return Transfer{}, parseError(response)
	}
	defer response.Body.Close()
	var transfer Transfer
	decodeErr := json.NewDecoder(response.Body).Decode(&transfer)
	if writeErr := <-writeDone; writeErr != nil && decodeErr == nil {
		decodeErr = writeErr
	}
	return transfer, decodeErr
}

func mustJSON(value any) string {
	data, _ := json.Marshal(value)
	return string(data)
}

func (c *Client) List(ctx context.Context, projectID, targetNetwork string) ([]Transfer, error) {
	endpoint, err := url.Parse(c.endpoint("transfers"))
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("projectId", projectID)
	query.Set("targetNetwork", targetNetwork)
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		return nil, parseError(response)
	}
	defer response.Body.Close()
	var transfers []Transfer
	return transfers, json.NewDecoder(response.Body).Decode(&transfers)
}

func (c *Client) Download(ctx context.Context, id, destination string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint("transfers", id, "bundle"), nil)
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	if response.StatusCode != http.StatusOK {
		return parseError(response)
	}
	defer response.Body.Close()
	tempPath := destination + ".tmp"
	file, err := os.OpenFile(tempPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, response.Body)
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(tempPath)
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	return os.Rename(tempPath, destination)
}

func (c *Client) AcknowledgeDownload(ctx context.Context, id string) error {
	return c.noContent(ctx, http.MethodPost, []string{"transfers", id, "download-ack"})
}

func (c *Client) Delete(ctx context.Context, id string) error {
	return c.noContent(ctx, http.MethodDelete, []string{"transfers", id})
}

func (c *Client) UploadFile(ctx context.Context, manifest FileManifest, sourcePath string) (FileTransfer, error) {
	source, err := os.Open(sourcePath)
	if err != nil {
		return FileTransfer{}, err
	}
	reader, writer := io.Pipe()
	multipartWriter := multipart.NewWriter(writer)
	writeDone := make(chan error, 1)
	go func() {
		defer source.Close()
		defer close(writeDone)
		if err := multipartWriter.WriteField("manifest", mustJSON(manifest)); err != nil {
			_ = writer.CloseWithError(err)
			writeDone <- err
			return
		}
		part, err := multipartWriter.CreateFormFile("file", filepath.Base(sourcePath))
		if err == nil {
			_, err = io.Copy(part, source)
		}
		if closeErr := multipartWriter.Close(); err == nil {
			err = closeErr
		}
		if err != nil {
			_ = writer.CloseWithError(err)
		} else {
			err = writer.Close()
		}
		writeDone <- err
	}()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint("files"), reader)
	if err != nil {
		return FileTransfer{}, err
	}
	request.Header.Set("Content-Type", multipartWriter.FormDataContentType())
	response, err := c.httpClient.Do(request)
	if err != nil {
		return FileTransfer{}, err
	}
	if response.StatusCode != http.StatusCreated {
		return FileTransfer{}, parseError(response)
	}
	defer response.Body.Close()
	var transfer FileTransfer
	decodeErr := json.NewDecoder(response.Body).Decode(&transfer)
	if writeErr := <-writeDone; writeErr != nil && decodeErr == nil {
		decodeErr = writeErr
	}
	return transfer, decodeErr
}

func (c *Client) ListFiles(ctx context.Context, projectID, targetNetwork string) ([]FileTransfer, error) {
	endpoint, err := url.Parse(c.endpoint("files"))
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("projectId", projectID)
	query.Set("targetNetwork", targetNetwork)
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		return nil, parseError(response)
	}
	defer response.Body.Close()
	var transfers []FileTransfer
	return transfers, json.NewDecoder(response.Body).Decode(&transfers)
}

func (c *Client) DownloadFile(ctx context.Context, id, destination, expectedSHA256 string) error {
	if _, err := os.Stat(destination); err == nil {
		return fmt.Errorf("destination file already exists: %s", destination)
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint("files", id, "content"), nil)
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	if response.StatusCode != http.StatusOK {
		return parseError(response)
	}
	defer response.Body.Close()
	tempPath := destination + ".tmp"
	file, err := os.OpenFile(tempPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	hasher := sha256.New()
	_, copyErr := io.Copy(io.MultiWriter(file, hasher), response.Body)
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(tempPath)
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	actual := hex.EncodeToString(hasher.Sum(nil))
	if actual != expectedSHA256 {
		_ = os.Remove(tempPath)
		return fmt.Errorf("downloaded file SHA-256 does not match transfer metadata")
	}
	if err := os.Rename(tempPath, destination); err != nil {
		_ = os.Remove(tempPath)
		return err
	}
	return nil
}

func (c *Client) AcknowledgeFileDownload(ctx context.Context, id string) error {
	return c.noContent(ctx, http.MethodPost, []string{"files", id, "download-ack"})
}
func (c *Client) DeleteFile(ctx context.Context, id string) error {
	return c.noContent(ctx, http.MethodDelete, []string{"files", id})
}

func (c *Client) noContent(ctx context.Context, method string, parts []string) error {
	request, err := http.NewRequestWithContext(ctx, method, c.endpoint(parts...), bytes.NewReader(nil))
	if err != nil {
		return err
	}
	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	if response.StatusCode != http.StatusNoContent {
		return parseError(response)
	}
	return response.Body.Close()
}
