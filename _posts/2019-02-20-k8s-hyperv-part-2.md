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
Last time we have taken the time to setup the physical cluster the way we wanted and prepared the way for Kubernetes to be installed. In this part of the tutorial, I will show you how I initalised my Master and Worker nodes using ```kubeadm``` commandline tool and deploying cluster networking.  

## Master Node
With the Master Node VM booted, we need to log onto it over ```ssh```. Once logged on we need to escalate our session to the root level.  

{% highlight bash %}
sudo -i
{% endhighlight %}

Since I am using **Differencing Disk**, I need to further configure the nodes with individual details:

Hostname | kubeMaster
IP | 192.168.1.201/24
Default gateway | 192.168.1.1
Nameservers | 192.168.1.1

If you are using Ubuntu as I am here is the what you need to do, otherwise, please refer to your platforms documentations on how to change the above settings.

To change the hostname:
{% highlight bash %}
hostnamectl set-hostname kubeMaster

-- You can check the hostname before / after change using...
hostnamectl

-- You should have something like this...
Static hostnmame: kubeMaster
       Icon name: computer-vm
         Chassis: vm
      Machine ID: ...
         Boot ID: ...
  Virtualization: microsoft   
Operating System: Ubuntu 18.04.1 LTS
          Kernel: Linux 4.15.0-43-generic
    Architecture: x86-64
{% endhighlight %}

To change the IP address settings:
{% highlight bash %}
nano /etc/netplan/50-cloud-init.ymal

-- Once you are inside nano you need something like the following:
network:
    enthernets:
        eth0:
            addresses:
            - 192.168.1.201/24
            dhcp4: false
            dhcp6: false
            gateway4: 192.168.1.1
            nameservers:
                addresses:
                - 192.168.1.1
                search:
                - < you domain prefixes >
    version: 2            
{% endhighlight %}

After you have made the edit and save the file, you need to restart the network services to allow the system to pick up the new static ip address.

{% highlight bash %}
netplan apply

-- You can verify the change by ...
ifconfig --all

-- I normally would follow with a reboot to make sure the new settings will stick
reboot
{% endhighlight %}

After reboot and again change to ```root``` we can execute the ```kubeadm init``` command to tell Kubernetes to setup a new cluster with this node being the Master Node.

{% highlight bash %}
kubeadm init
{% endhighlight %}

For me, I don't need to specify other parameters, I accept the default values ```kubeadm init``` are going to be used. However, I will explain a few useful parameters below just in case you would like to customise your cluster according to your needs and preferences.

```--apiserver-advertise-address``` | The IP address that the API server will be binding to, you can specify this if your node has multiple network IP addresses. The default is ```0.0.0.0```.
```--apiserver-bind-port``` | The port to which the API server will listen for requests. The default is ```6443```.
```--pod-network-cidr``` | This is the string in the form of ```1.2.3.4/24```. This will determine the network address range for the pod network. 
```--service-cidr``` | Similar to the pod network setting but this will specify the network address range for the services. The default is ```10.96.0.0/12```.
```--igonre-preflight-errors``` | This option will instruct the ```kubeadm``` to ignore the listed errors if found during the preflight checks. For a full range of error strings please refer to official documentation.

There are more options and examples on how to initialise the cluster with different circumstances, you can read about it within the official documentation available [here](https://kubernetes.io/docs/home/).

After a while your cluster will be initialised and ```kubeadm init``` will display something like the following screen cap:

![kubeadm init result](/assets/img/20190220_001.jpg)

It basically telling you that it has pulled the various kubernetes docker images from the source, deployed a bunch of containers that makes up the cluster. The certificates and the related infrastructures for the master node has been setup. Then it went through some setup of basic addons. For the more details about the inner workings of cluster initialisation please refer to the official documentations.

There are two things need out attention, first, a further setup for normal users to access the cluster and we need to note down the command generated for joining worker nodes to the cluster.

To setup your non-root user to have access to the cluster:
{% highlight bash %}
-- first log out of the root session
exit

-- then run the commands suggested by kubeadm 
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
{% endhighlight %}

## Cluster Networking
Before we can join the worker nodes to the cluster we need to deploy cluster networking. Without this networking layer, pods and services will not be able to function.

There are multiple proprietary or open source cluster networking addons available, some require additional purchasing but the marjority are free. I have found this [blog post](https://www.objectif-libre.com/en/blog/2018/07/05/k8s-network-solutions-comparison/) that did a detailed comparison between the most popular products available today and I found it very helpful.

At the end I chose [WeaveNet](https://www.weave.works/docs/net/latest/kubernetes/kube-addon/) from Weaveworks. To install WeaveNet onto the newly created cluster I followed the documentation and ran the following:
{% highlight bash %}
-- the netsted kubectl command will generate the final part of the url using the version of the kubernetes installation
kubectl apply -f "https://cloud.weave.works/k8s/net?k8s-version=$(kubectl version | base64 | tr -d '\n')"

-- when the deployment has been made, you should see somthing like that 
serviceaccount/weave-net created
clusterrole.rbac.authorization.k8s.io/weave-net created
clusterrolebinding.rbac.authorization.k8s.io/weave-net created
role.rbac.authorization.k8s.io/weave-net created
rolebinding.rbac,authorization.k8s.io/weave0-net created
daemonset.extensions/weave-net created

-- you need to wait unit the pods are running before you can move onto joining the worker nodes to the cluster
kubecrl get pods -n kube-system -l name=weave-net

-- if you see that the READY colume is not 2/2 wait a while
NAME              READY   STATUS    RESTARTS    AGE
weave-net-xxxxx   1/2     Running   0           43s

-- if you see something similar to the following, then it is ready 
NAME              READY   STATUS    RESTARTS    AGE
weave-net-xxxxx   2/2     Running   0           51s
{% endhighlight %}

## Worker Node
Now that the Master node and the cluster has been initialised and ready to accept worker nodes, it is time to boot up the worker node VMs and join them to the cluster.

As with the Master node, we need to apply the hostname and ip changes to the worker nodes. The following is the configurations, please refer back to the top of the article for how to make these changes.

Hostname | kubeWorker001
IP | 192.168.1.202/24
Default gateway | 192.168.1.1
Nameservers | 192.168.1.1
 |
Hostname | kubeWorker002
IP | 192.168.1.203/24
Default gateway | 192.168.1.1
Nameservers | 192.168.1.1

After you have made the changes and rebooted to make sure the nodes are using the correct settings, we can then join them to the cluster using the command generated during the cluster initialisation.

{% highlight bash %}
-- elevate session to root 
sudo -i

-- issue the command from cluster initialisation to join the worker nodes to the cluster
kubeadm join 192.168.1.201:6443 --token oyni14.pz4ks1208za5oi96 --discovery-token-ca-cert-hash sha256:0f1121f49ea74dd3f03c209116c786abe62ce197ee1b7aefccd2ba6d104b8d25

-- to check if the worker nodes has joined the cluster, you can issue this command at the Master node
kubectl get nodes

-- and you should see something similar to the following
NAME              STATUS    ROLES     AGE     VERSION
kubeMaster        Running   master    169m    v1.13.1
kubeWorker001     Running   worker    10m     v1.13.1
kubeWorker002     Running   worker    5m      v1.13.1
{% endhighlight %}

When the worker nodes joined into the cluster, the CNI (Cluster Networking Interface, i.e.: weavenet) pod will be deployed onto the new nodes, so that all nodes in the cluster can communicate with each other.

{% highlight bash %}
kubectl get pods -n kube-system -l name=weave-net

-- you should see something similar to the following:
NAME              READY   STATUS    RESTARTS    AGE
weave-net-xxxxx   2/2     Running   0           169m
weave-net-yyyyy   2/2     Running   0           20m
weave-net-zzzzz   2/2     Running   0           18m
{% endhighlight %}

## Conclusion

As the last section concludes this part of the setup, lets look at where we stands in the list of things that needs to be done:

- [x] Using Hyper-V to setup the basic infrastructure for the cluster
- [x] Preparing the virtual machines as Kubernetes nodes (Master and Worker)
- [x] Initialised the cluster on Master VM via ```kubeadm``` tool
- [x] Join the Worker nodes to the cluster via ```kubeadm``` tool
- [x] Install cluster networking
- [ ] Setup cluster storage

In this installment in the series, I have shared with you how I setup the various nodes participating in the cluster. I have also showed you how to setup CNI within the cluster. 

Next time, I will be looking into storage for the cluster as there are apps that require their states to be presistent. The default state model in Kubernetes is that pods and services should be stateless.

See you all next time.
---