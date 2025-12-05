FROM golang:1.21-alpine AS build

WORKDIR /app

COPY go.mod ./

RUN go mod download

COPY . .

RUN go build -o main .

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=build /app/main .

EXPOSE 8081

CMD ["./main"]
