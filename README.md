# DADN Cold Storage Manager

## Overview

DADN Cold Storage Manager is a full-stack web application for monitoring and managing cold storage facilities. The system is designed to help operators track storage zones, manage devices, view sensor data, handle alerts, and support daily warehouse operations in a centralized dashboard.

The project is organized into two main parts:
- `backend`: Spring Boot REST API and business logic
- `frontend`: Next.js web client for the user interface

## Team Members

This project is developed by a team of 5 members.

## Purpose

The web application is used to support cold storage management tasks such as:
- Monitoring temperature and related sensor data
- Managing devices and storage zones
- Tracking inventory in and out
- Receiving alerts and notifications
- Reviewing logs, reports, and system activity

## Target Users

The system is intended for:
- Warehouse managers
- Cold storage operators
- Administrators
- Staff responsible for inventory and device monitoring

## Technologies Used

### Backend
- Java 17
- Spring Boot 3.3
- Spring Web
- Spring Data JPA
- Spring Security
- WebSocket / STOMP
- PostgreSQL
- MQTT client
- JWT authentication
- Maven

### Frontend
- Next.js
- React 19
- TypeScript
- Tailwind CSS
- Shadcn UI / Radix UI
- TanStack React Query
- Recharts
- Socket/STOMP client libraries

### Tools and Deployment
- Docker / Docker Compose
- ESLint
- Vitest
- Playwright

## Project Structure

- `backend/demo`: backend source code and database scripts
- `frontend`: frontend source code and UI components
