---
layout: post
title: Setting up my first Kubernetes cluster - Part 2
categories:
- blog
---

Recently, I tried to setup a CI / CD (Continuous Integration / Continuous Delivery) pipeline for some of the projects I am working on. I have been using my own GitLab instance hosted on my trusted home server for the past couple of years. Therefore, I am eager to setup the pipeline using GitLab CI, the official GitLab CI / CD extension to their code repository. As I look into GitLab CI, Kubernetes is being presented as the default platform on which most of the automations are being delivered.

This series of articles records my journey in setting up my first Kubernetes cluster. I hope that at the end of this series you will be able to:

* Using Hyper-V to setup the basic infrastructure for the cluster
* Preparing the Virtual Machines (VM) as Kubernetes nodes (master and worker)
* Initialise the cluster on Master node via ```kubeadm``` tool
* Initialise and join the worker nodes to the cluster via ```kubeadm``` tool
* Install cluster networking
* Install cluster storage

I will update and expand the series as I come across new areas during my pursue of the CI / CD pipeline. There will also be a seperate series of articles about on setting up GitLab CI.

---
In this part of the tutorial, I will show you how I initalised my Master and Worker nodes using ```kubeadm``` commandline tool and deploying cluster networking.  

## Master Node
With the Master Node VM booted, we need to log onto it and 
## Cluster Networking

## Worker Node

## Conclusion

As the last section concludes this part of the setup, lets look at where we stands in the list of things that needs to be done:

- [x] Using Hyper-V to setup the basic infrastructure for the cluster
- [x] Preparing the virtual machines as Kubernetes nodes (Master and Worker)
- [x] Initialised the cluster on Master VM via ```kubeadm``` tool
- [x] Join the Worker nodes to the cluster via ```kubeadm``` tool
- [x] Install cluster networking
- [ ] Setup cluster storage

---