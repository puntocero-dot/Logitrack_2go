FROM golang:1.21-alpine AS build

WORKDIR /app

COPY go.mod ./

RUN go mod download

COPY . .

# Ensure go.sum is up to date for all dependencies
RUN go mod tidy

RUN go build -o main .

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=build /app/main .

EXPOSE 8080

CMD ["./main"]
